import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { sinceHours } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

const truncate = (s: string | null, n = 300) => (s && s.length > n ? s.slice(0, n) + '…' : s)

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('failedPage') || '1'))
  const pageSize = 20

  const [
    emailByStatus, emailSent24h, oldestPending, failedItems, failedTotal,
    recByStatus, recErrorItems,
  ] = await Promise.all([
    prisma.emailQueue.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.emailQueue.count({ where: { status: 'sent', sentAt: { gte: sinceHours(24) } } }),
    prisma.emailQueue.findFirst({
      where: { status: 'pending' },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    }),
    prisma.emailQueue.findMany({
      where: { status: 'failed' },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, type: true, attempts: true, lastError: true, scheduledAt: true, updatedAt: true },
    }),
    prisma.emailQueue.count({ where: { status: 'failed' } }),
    prisma.dealRecording.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.dealRecording.findMany({
      where: { status: 'error' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, dealId: true, fileName: true, attempts: true, error: true, createdAt: true },
    }),
  ])

  const statusMap = (rows: { status: string; _count: { _all: number } }[]) =>
    Object.fromEntries(rows.map(r => [r.status, r._count._all]))

  return NextResponse.json({
    email: {
      byStatus: statusMap(emailByStatus),
      sent24h: emailSent24h,
      oldestPendingAt: oldestPending?.scheduledAt ?? null,
      failedItems: {
        items: failedItems.map(i => ({ ...i, lastError: truncate(i.lastError) })),
        total: failedTotal,
        page,
        totalPages: Math.max(1, Math.ceil(failedTotal / pageSize)),
      },
    },
    recording: {
      byStatus: statusMap(recByStatus),
      errorItems: recErrorItems.map(i => ({ ...i, error: truncate(i.error) })),
    },
  })
}
