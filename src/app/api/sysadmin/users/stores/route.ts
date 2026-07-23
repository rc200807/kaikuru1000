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

  const active = stores.filter(s => s.isActive && s.storeStatus !== 'closed').length
  const closed = stores.filter(s => s.storeStatus === 'closed').length

  return NextResponse.json({
    summary: { active, closed, total: stores.length },
    stores: stores.map(s => ({
      id: s.id,
      name: s.name,
      code: s.code,
      prefecture: s.prefecture,
      isActive: s.isActive,
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
