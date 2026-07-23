import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { sinceDays, sinceHours } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

const truncate = (s: string | null, n = 300) => (s && s.length > n ? s.slice(0, n) + '…' : s)

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    stripe24h, stripe7d, stripeLast, stripeByType,
    syncLogs, syncErrors7d,
    formSheetErrors, formApiErrors, formRecentErrors,
    listingByStatus, listingErrors,
  ] = await Promise.all([
    prisma.stripeWebhookEvent.count({ where: { createdAt: { gte: sinceHours(24) } } }),
    prisma.stripeWebhookEvent.count({ where: { createdAt: { gte: sinceDays(7) } } }),
    prisma.stripeWebhookEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.stripeWebhookEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: sinceDays(7) } },
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
    }),
    prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 20 }),
    prisma.syncLog.count({ where: { status: 'error', syncedAt: { gte: sinceDays(7) } } }),
    prisma.formSubmission.count({ where: { sheetSyncError: { not: null } } }),
    prisma.formSubmission.count({ where: { externalApiError: { not: null } } }),
    prisma.formSubmission.findMany({
      where: { OR: [{ sheetSyncError: { not: null } }, { externalApiError: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, sheetSyncError: true, externalApiError: true, createdAt: true,
        form: { select: { title: true } },
      },
    }),
    prisma.marketplaceListing.groupBy({ by: ['listingStatus'], _count: { _all: true } }),
    prisma.marketplaceListing.findMany({
      where: { listingStatus: 'error' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true, marketplace: true, errorMessage: true, updatedAt: true,
        inventoryItem: { select: { title: true } },
      },
    }),
  ])

  return NextResponse.json({
    stripe: {
      count24h: stripe24h,
      count7d: stripe7d,
      lastReceivedAt: stripeLast?.createdAt ?? null,
      byType: stripeByType.map(t => ({ type: t.type, count: t._count._all })),
    },
    sheetSync: {
      recent: syncLogs,
      errorCount7d: syncErrors7d,
    },
    forms: {
      sheetErrorCount: formSheetErrors,
      apiErrorCount: formApiErrors,
      recentErrors: formRecentErrors.map(f => ({
        id: f.id,
        formName: f.form?.title ?? '—',
        sheetSyncError: truncate(f.sheetSyncError),
        externalApiError: truncate(f.externalApiError),
        createdAt: f.createdAt,
      })),
    },
    listings: {
      byStatus: listingByStatus.map(l => ({ status: l.listingStatus, count: l._count._all })),
      errorItems: listingErrors.map(l => ({
        id: l.id,
        marketplace: l.marketplace,
        title: l.inventoryItem?.title ?? '—',
        errorMessage: truncate(l.errorMessage),
        updatedAt: l.updatedAt,
      })),
    },
  })
}
