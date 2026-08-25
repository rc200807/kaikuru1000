import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { recordAccessLog } from '@/lib/access-log'
import { prisma } from '@/lib/prisma'

/**
 * 店舗削除をブロックする業務データを、別の店舗へ一括で付け替える。
 *
 * 「決済記録（StorePayment）」は対象外: @@unique([storeId, kind, billingMonth]) による
 * 月次課金の二重実行防止の対象であり、また店舗ごとの請求実績そのもの（会計上の履歴）なので
 * 付け替えると請求の帰属が壊れる。決済記録が残る店舗は、この移行では削除可能にならない
 * （営業ステータスを「閉店」にする運用を案内する）。
 */
const MIGRATABLE_MODELS = [
  { key: 'customers',            label: '顧客',             fn: (from: string, to: string) => prisma.user.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'visitSchedules',       label: '訪問予定',         fn: (from: string, to: string) => prisma.visitSchedule.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'visitRequests',        label: '訪問依頼',         fn: (from: string, to: string) => prisma.visitRequest.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'deals',                label: '案件',             fn: (from: string, to: string) => prisma.deal.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'inquiries',            label: 'お問い合わせ',     fn: (from: string, to: string) => prisma.inquiry.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'complaints',           label: 'クレーム',         fn: (from: string, to: string) => prisma.complaint.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'bugReports',           label: '不具合報告',       fn: (from: string, to: string) => prisma.bugReport.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'akiyaCases',           label: '空き家案件',       fn: (from: string, to: string) => prisma.akiyaCase.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'communityThreads',     label: '知恵袋の投稿',     fn: (from: string, to: string) => prisma.communityThread.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'communityReplies',     label: '知恵袋の返信',     fn: (from: string, to: string) => prisma.communityReply.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
  { key: 'communityReactions',   label: '知恵袋のリアクション', fn: (from: string, to: string) => prisma.communityReaction.updateMany({ where: { storeId: from }, data: { storeId: to } }) },
] as const

const BLOCKER_SELECT = {
  customers: true, visitSchedules: true, visitRequests: true,
  deals: true, inquiries: true, storePayments: true,
  complaints: true, bugReports: true, akiyaCases: true,
  communityThreads: true, communityReplies: true, communityReactions: true,
} as const

function buildBlockers(c: Record<string, number>) {
  return [
    { label: '顧客', count: c.customers },
    { label: '訪問予定', count: c.visitSchedules },
    { label: '訪問依頼', count: c.visitRequests },
    { label: '案件', count: c.deals },
    { label: 'お問い合わせ', count: c.inquiries },
    { label: '決済記録', count: c.storePayments },
    { label: 'クレーム', count: c.complaints },
    { label: '不具合報告', count: c.bugReports },
    { label: '空き家案件', count: c.akiyaCases },
    { label: '知恵袋の投稿', count: c.communityThreads },
    { label: '知恵袋の返信', count: c.communityReplies },
    { label: '知恵袋のリアクション', count: c.communityReactions },
  ].filter(b => b.count > 0)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const targetStoreId = typeof body?.targetStoreId === 'string' ? body.targetStoreId : ''
  if (!targetStoreId) return NextResponse.json({ error: '移行先の店舗を選択してください' }, { status: 400 })
  if (targetStoreId === id) return NextResponse.json({ error: '移行元と同じ店舗は指定できません' }, { status: 400 })

  const [store, targetStore] = await Promise.all([
    prisma.store.findUnique({ where: { id }, select: { id: true, name: true, code: true } }),
    prisma.store.findUnique({ where: { id: targetStoreId }, select: { id: true, name: true, code: true } }),
  ])
  if (!store) return NextResponse.json({ error: '移行元の店舗が見つかりません' }, { status: 404 })
  if (!targetStore) return NextResponse.json({ error: '移行先の店舗が見つかりません' }, { status: 404 })

  const results = await prisma.$transaction(MIGRATABLE_MODELS.map(m => m.fn(id, targetStoreId)))
  const migrated = MIGRATABLE_MODELS
    .map((m, i) => ({ label: m.label, count: results[i].count }))
    .filter(m => m.count > 0)

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `店舗のデータを「${targetStore.name}」へ移行「${store.name}」（${store.code}）`,
    req: request,
  })

  const after = await prisma.store.findUnique({ where: { id }, select: { _count: { select: BLOCKER_SELECT } } })
  const remainingBlockers = after ? buildBlockers(after._count as unknown as Record<string, number>) : []

  return NextResponse.json({ migrated, remainingBlockers, targetStoreName: targetStore.name })
}
