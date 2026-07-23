import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { aggregateDaily, sinceDays } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const d30 = sinceDays(30)

  const [sessionRows, byChannel, pvCount, cvRows, cvByType, sites] = await Promise.all([
    prisma.trackingSession.findMany({ where: { startedAt: { gte: d30 } }, select: { startedAt: true } }),
    prisma.trackingSession.groupBy({ by: ['channel'], where: { startedAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.trackingPageView.count({ where: { occurredAt: { gte: d30 } } }),
    prisma.trackingEvent.findMany({
      where: { isConversion: true, occurredAt: { gte: d30 } },
      select: { occurredAt: true },
    }),
    prisma.trackingEvent.groupBy({
      by: ['type'],
      where: { isConversion: true, occurredAt: { gte: d30 } },
      _count: { _all: true },
    }),
    prisma.trackingSite.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { createdAt: 'asc' } }),
  ])

  return NextResponse.json({
    sessions: {
      count30d: sessionRows.length,
      daily: aggregateDaily(sessionRows.map(r => r.startedAt), 30),
      byChannel: byChannel.map(c => ({ channel: c.channel ?? 'direct', count: c._count._all })),
    },
    pageViews: { count30d: pvCount },
    conversions: {
      count30d: cvRows.length,
      daily: aggregateDaily(cvRows.map(r => r.occurredAt), 30),
      byType: cvByType.map(t => ({ type: t.type, count: t._count._all })),
    },
    sites,
  })
}
