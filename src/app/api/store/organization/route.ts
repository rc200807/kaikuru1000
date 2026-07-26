import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOperatorStores, isOrgAdmin } from '@/lib/store-scope'
import { parseStoreServices } from '@/lib/store-services'

/**
 * 組織（運営者）情報 — 店舗ポータル用。
 * GET: 運営者情報＋配下店舗一覧＋組織管理者フラグ。ナビ・スコープ選択の初期化に使う。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionStoreId = user.id as string

  const [{ operator, stores }, orgAdmin, self] = await Promise.all([
    getOperatorStores(sessionStoreId),
    isOrgAdmin({ id: sessionStoreId, memberId: user.memberId ?? null }),
    prisma.store.findUnique({ where: { id: sessionStoreId }, select: { supportedServices: true } }),
  ])

  return NextResponse.json({
    operator,
    stores: stores.map(s => ({
      id: s.id,
      name: s.name,
      code: s.code,
      avatar: s.avatar,
      address: s.address,
      phone: s.phone,
      storeStatus: s.storeStatus,
      memberCount: s._count.members,
    })),
    isOrgAdmin: operator ? orgAdmin : false,
    // セッション店舗の対応サービス（機能ゲート用。例: ['kaikuru','akikuru']）
    services: parseStoreServices(self?.supportedServices),
    sessionStoreId,
  })
}

/** PATCH: 運営者の連絡系フィールドのみ更新（組織管理者のみ）。構造変更（店舗紐付け等）は管理ポータル専用。 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionStoreId = user.id as string

  const [store, orgAdmin] = await Promise.all([
    prisma.store.findUnique({ where: { id: sessionStoreId }, select: { operatorId: true } }),
    isOrgAdmin({ id: sessionStoreId, memberId: user.memberId ?? null }),
  ])
  if (!store?.operatorId) {
    return NextResponse.json({ error: '運営者が登録されていません' }, { status: 404 })
  }
  if (!orgAdmin) {
    return NextResponse.json({ error: '組織管理者の権限が必要です' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })

  // 連絡系フィールドのみ許可
  const ALLOWED = ['phone', 'email', 'address', 'invoiceNumber', 'service'] as const
  const data: Record<string, string | null> = {}
  for (const key of ALLOWED) {
    if (key in body) {
      const v = body[key]
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json({ error: `${key} の形式が不正です` }, { status: 400 })
      }
      data[key] = typeof v === 'string' ? v.trim().slice(0, 500) || null : null
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  const updated = await prisma.operator.update({
    where: { id: store.operatorId },
    data,
    select: { id: true, phone: true, email: true, address: true, invoiceNumber: true, service: true },
  })
  return NextResponse.json(updated)
}
