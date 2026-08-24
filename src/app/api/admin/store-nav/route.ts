import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import {
  STORE_NAV_ITEMS,
  STORE_NAV_KEYS,
  mergeStoreNavSettings,
  parseStoreNavOverrideItems,
  storeNavItem,
} from '@/lib/store-nav'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 店舗ポータルのサイドメニュー設定（管理ポータル用）。
 * GET: 共通設定（並び順・表示/非表示）＋店舗ごとの特例＋店舗一覧
 * PUT: 共通設定の保存（{ order: string[], hidden: string[] }）
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [settings, overrides, stores] = await Promise.all([
    prisma.storeNavSetting.findMany({ select: { key: true, sortOrder: true, visible: true } }),
    prisma.storeNavOverride.findMany({
      select: {
        storeId: true, showAll: true, items: true, note: true, updatedAt: true,
        store: { select: { name: true, code: true } },
      },
    }),
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { code: 'asc' },
    }),
  ])

  const merged = mergeStoreNavSettings(settings)

  return NextResponse.json({
    items: merged.map(row => {
      const def = storeNavItem(row.key)!
      return {
        key: row.key,
        label: def.label,
        href: def.href,
        gate: def.gate ?? null,
        locked: !!def.locked,
        visible: row.visible,
      }
    }),
    overrides: overrides
      .map(o => ({
        storeId: o.storeId,
        storeName: o.store.name,
        storeCode: o.store.code,
        showAll: o.showAll,
        items: parseStoreNavOverrideItems(o.items),
        note: o.note,
        updatedAt: o.updatedAt,
      }))
      .sort((a, b) => a.storeCode.localeCompare(b.storeCode)),
    stores,
  })
}

/** PUT: 共通設定を保存。order は表示順、hidden は非表示にするキー */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const rawOrder: unknown = body?.order
  const rawHidden: unknown = body?.hidden
  if (!Array.isArray(rawOrder) || !Array.isArray(rawHidden)) {
    return NextResponse.json({ error: 'order / hidden が不正です' }, { status: 400 })
  }

  // 未知キーは黙って除外し、指定漏れのキーは定義順で末尾に足す（項目追加時も設定が壊れない）
  const order: string[] = []
  for (const key of rawOrder) {
    if (typeof key === 'string' && STORE_NAV_KEYS.includes(key) && !order.includes(key)) order.push(key)
  }
  for (const def of STORE_NAV_ITEMS) {
    if (!order.includes(def.key)) order.push(def.key)
  }

  const hidden = new Set(
    (rawHidden as unknown[]).filter((k): k is string => typeof k === 'string' && STORE_NAV_KEYS.includes(k)),
  )

  await prisma.$transaction(
    order.map((key, index) => {
      // locked 項目（ダッシュボード）は非表示にできない
      const visible = storeNavItem(key)?.locked ? true : !hidden.has(key)
      return prisma.storeNavSetting.upsert({
        where: { key },
        create: { key, sortOrder: index, visible },
        update: { sortOrder: index, visible },
      })
    }),
  )

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: '店舗メニュー設定を更新', req: request,
  })

  return NextResponse.json({ ok: true })
}
