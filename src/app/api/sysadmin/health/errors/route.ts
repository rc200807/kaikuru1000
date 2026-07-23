import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { aggregateDaily, sinceDays, sinceHours } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = 50
  const days = [1, 7, 30].includes(Number(searchParams.get('days'))) ? Number(searchParams.get('days')) : 7

  const errorWhere = { userType: 'error' as const }
  const listWhere = { userType: 'error', createdAt: { gte: sinceDays(days) } }

  const [h24, d7, d30, dailyRows, topActions, logs, total] = await Promise.all([
    prisma.accessLog.count({ where: { ...errorWhere, createdAt: { gte: sinceHours(24) } } }),
    prisma.accessLog.count({ where: { ...errorWhere, createdAt: { gte: sinceDays(7) } } }),
    prisma.accessLog.count({ where: { ...errorWhere, createdAt: { gte: sinceDays(30) } } }),
    prisma.accessLog.findMany({
      where: { ...errorWhere, createdAt: { gte: sinceDays(14) } },
      select: { createdAt: true },
    }),
    prisma.accessLog.groupBy({
      by: ['action'],
      where: { ...errorWhere, createdAt: { gte: sinceDays(7) } },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    }),
    prisma.accessLog.findMany({
      where: listWhere,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, action: true, userName: true, ip: true, userAgent: true, createdAt: true },
    }),
    prisma.accessLog.count({ where: listWhere }),
  ])

  return NextResponse.json({
    counts: { h24, d7, d30 },
    daily: aggregateDaily(dailyRows.map(r => r.createdAt), 14),
    topActions: topActions.map(a => ({ action: a.action, count: a._count._all })),
    logs: { items: logs, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)), days },
  })
}
