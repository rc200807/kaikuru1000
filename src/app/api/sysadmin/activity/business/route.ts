import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { aggregateDaily, sinceDays, jstStartOfToday } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = [7, 30, 90].includes(Number(searchParams.get('days'))) ? Number(searchParams.get('days')) : 30
  const since = sinceDays(days)

  const [
    dealTotal, dealByStatus, dealByCategory, dealNewRows,
    visitByStatus, upcomingVisits, visitNewRows,
    purchaseCount, purchaseNewRows,
  ] = await Promise.all([
    prisma.deal.count(),
    prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.deal.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.deal.findMany({ where: { occurredAt: { gte: since } }, select: { occurredAt: true } }),
    prisma.visitSchedule.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.visitSchedule.count({ where: { status: 'scheduled', visitDate: { gte: jstStartOfToday() } } }),
    prisma.visitSchedule.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.purchaseItem.count({ where: { createdAt: { gte: since } } }),
    prisma.purchaseItem.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ])

  return NextResponse.json({
    days,
    deals: {
      total: dealTotal,
      byStatus: dealByStatus.map(d => ({ status: d.status, count: d._count._all })),
      byCategory: dealByCategory.map(d => ({ category: d.category, count: d._count._all })),
      newInPeriod: dealNewRows.length,
      dailyNew: aggregateDaily(dealNewRows.map(r => r.occurredAt), days),
    },
    visits: {
      byStatus: visitByStatus.map(v => ({ status: v.status, count: v._count._all })),
      upcoming: upcomingVisits,
      newInPeriod: visitNewRows.length,
      dailyNew: aggregateDaily(visitNewRows.map(r => r.createdAt), days),
    },
    purchaseItems: {
      countInPeriod: purchaseCount,
      dailyNew: aggregateDaily(purchaseNewRows.map(r => r.createdAt), days),
    },
  })
}
