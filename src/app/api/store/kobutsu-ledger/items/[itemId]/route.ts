import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { purchaseItemBelongsToStore } from '@/lib/kobutsu-ledger-server'
import { isKobutsuCategoryKey } from '@/lib/kobutsu-ledger'
import { recordAccessLog } from '@/lib/access-log'

/**
 * 古物台帳の補記（法定記載事項の手入力）。
 * 自動生成で埋まらない「品目（法定13品目）」「特徴」「備考」を買取品目ごとに保存する。
 * PATCH: 上書き保存（null / 空文字で自動生成に戻す）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string

  const { itemId } = await params
  if (!(await purchaseItemBelongsToStore(itemId, storeId))) {
    return NextResponse.json({ error: '買取品目が見つかりません' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })

  const data: { kobutsuCategory?: string | null; features?: string | null; note?: string | null; updatedByName?: string | null } = {}

  if ('kobutsuCategory' in body) {
    const v = body.kobutsuCategory
    if (v === null || v === '') data.kobutsuCategory = null
    else if (isKobutsuCategoryKey(v)) data.kobutsuCategory = v
    else return NextResponse.json({ error: '品目の指定が不正です' }, { status: 400 })
  }
  if ('features' in body) {
    const v = body.features
    if (v !== null && typeof v !== 'string') return NextResponse.json({ error: '特徴の形式が不正です' }, { status: 400 })
    data.features = typeof v === 'string' ? v.trim().slice(0, 1000) || null : null
  }
  if ('note' in body) {
    const v = body.note
    if (v !== null && typeof v !== 'string') return NextResponse.json({ error: '備考の形式が不正です' }, { status: 400 })
    data.note = typeof v === 'string' ? v.trim().slice(0, 1000) || null : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }
  data.updatedByName = (user.memberName || user.name || null) as string | null

  const saved = await prisma.kobutsuLedgerEntry.upsert({
    where: { purchaseItemId: itemId },
    create: { purchaseItemId: itemId, ...data },
    update: data,
    select: { kobutsuCategory: true, features: true, note: true, updatedAt: true },
  })

  await recordAccessLog({
    userType: user.role, userId: storeId, userName: user.name, memberId: user.memberId ?? null,
    action: '古物台帳の記載を更新', req: request,
  })

  return NextResponse.json(saved)
}
