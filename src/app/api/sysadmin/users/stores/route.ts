import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [stores, operators, lastLogins] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true, name: true, code: true, prefecture: true, isActive: true, storeStatus: true,
        isTestStore: true,
        openingDate: true, closingDate: true, createdAt: true,
        operator: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.operator.findMany({
      select: {
        id: true, name: true, entityType: true, supportedServices: true, createdAt: true,
        _count: { select: { stores: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.accessLog.groupBy({
      by: ['userId'],
      where: { userType: 'store', action: 'login', userId: { not: null } },
      _max: { createdAt: true },
    }),
  ])

  const lastLoginMap = new Map(lastLogins.map(l => [l.userId, l._max.createdAt]))

  // 一覧にはテスト店舗も出す（運用上そこにあることを見えなくしない）が、
  // 件数のサマリーは実店舗だけで数える
  const realStores = stores.filter(s => !s.isTestStore)
  const active = realStores.filter(s => s.isActive && s.storeStatus !== 'closed').length
  const closed = realStores.filter(s => s.storeStatus === 'closed').length

  return NextResponse.json({
    summary: {
      active,
      closed,
      total: realStores.length,
      testStores: stores.length - realStores.length,
    },
    stores: stores.map(s => ({
      id: s.id,
      name: s.name,
      code: s.code,
      prefecture: s.prefecture,
      isActive: s.isActive,
      isTestStore: s.isTestStore,
      storeStatus: s.storeStatus,
      openingDate: s.openingDate,
      closingDate: s.closingDate,
      operatorName: s.operator?.name ?? null,
      memberCount: s._count.members,
      lastLoginAt: lastLoginMap.get(s.id) ?? null,
    })),
    operators: operators.map(o => ({
      id: o.id,
      name: o.name,
      entityType: o.entityType,
      supportedServices: o.supportedServices,
      storeCount: o._count.stores,
      createdAt: o.createdAt,
    })),
  })
}
