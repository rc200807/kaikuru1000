import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { STORE_NAV_KEYS, stringifyStoreNavOverrideItems } from '@/lib/store-nav'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 店舗ごとのメニュー特例。共通設定より優先される。
 * PUT: 特例を作成・更新（{ storeId, showAll, items: { key: boolean }, note }）
 * DELETE: 特例を削除して共通設定に戻す（?storeId=）
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const storeId: unknown = body?.storeId
  if (typeof storeId !== 'string' || !storeId) {
    return NextResponse.json({ error: 'storeId が不正です' }, { status: 400 })
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  const showAll = body?.showAll === true
  const rawItems = body?.items
  const items: Record<string, boolean> = {}
  if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) {
    for (const [key, value] of Object.entries(rawItems as Record<string, unknown>)) {
      if (STORE_NAV_KEYS.includes(key) && typeof value === 'boolean') items[key] = value
    }
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) || null : null

  const saved = await prisma.storeNavOverride.upsert({
    where: { storeId },
    create: { storeId, showAll, items: stringifyStoreNavOverrideItems(items), note },
    update: { showAll, items: stringifyStoreNavOverrideItems(items), note },
    select: { storeId: true, showAll: true, items: true, note: true },
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `店舗メニューの特例を更新（${store.name}）`, req: request,
  })

  return NextResponse.json(saved)
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId が必要です' }, { status: 400 })

  const existing = await prisma.storeNavOverride.findUnique({
    where: { storeId },
    select: { id: true, store: { select: { name: true } } },
  })
  if (!existing) return NextResponse.json({ error: '特例が見つかりません' }, { status: 404 })

  await prisma.storeNavOverride.delete({ where: { storeId } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `店舗メニューの特例を削除（${existing.store.name}）`, req: request,
  })

  return NextResponse.json({ ok: true })
}
