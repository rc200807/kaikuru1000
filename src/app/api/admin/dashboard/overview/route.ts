import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export type DashboardOverview = {
  access: {
    activeVisitors: number
    last7d: { visitors: number; sessions: number; pageviews: number; conversions: number }
    cvBreakdown: { inquiry: number; form: number; button: number }
  }
  chat: {
    recent: {
      storeId: string | null
      storeName: string | null
      storeCode: string | null
      authorType: string
      authorName: string
      preview: string
      createdAt: string
    }[]
  }
  contracts: {
    recent: {
      id: string
      customerName: string
      storeName: string | null
      amount: number | null
      agreedAt: string
    }[]
  }
  alerts: {
    inquiriesNew: number
    bugsOpen: number
    membersPendingApproval: number
    deliveriesShipped: number
    unassignedCustomers: number
    idMissing: number
  }
}

// ダッシュボードの「システム概要」用。軽量な集計のみ（重い analytics/tracking は使わない）。
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const since30min = new Date(now - 30 * 60 * 1000)

  const [
    activeSessions,
    visitorGroups,
    sessions7d,
    pageviews7d,
    conversions7d,
    cvGroups,
    chatMessages,
    contracts,
    inquiriesNew,
    bugsOpen,
    membersPendingApproval,
    deliveriesShipped,
    unassignedCustomers,
    idMissing,
  ] = await Promise.all([
    prisma.trackingSession.findMany({ where: { lastActivityAt: { gte: since30min } }, select: { visitorId: true }, take: 2000 }),
    prisma.trackingSession.groupBy({ by: ['visitorId'], where: { startedAt: { gte: since7d } } }),
    prisma.trackingSession.count({ where: { startedAt: { gte: since7d } } }),
    prisma.trackingPageView.count({ where: { occurredAt: { gte: since7d } } }),
    prisma.trackingEvent.count({ where: { isConversion: true, occurredAt: { gte: since7d } } }),
    prisma.trackingEvent.groupBy({ by: ['type'], where: { isConversion: true, occurredAt: { gte: since7d } }, _count: { _all: true } }),
    prisma.chatMessage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        authorType: true, authorName: true, body: true, createdAt: true,
        room: { select: { store: { select: { id: true, name: true, code: true } } } },
      },
    }),
    prisma.salesContract.findMany({
      orderBy: { agreedAt: 'desc' },
      take: 8,
      select: {
        id: true, agreedAt: true,
        visitSchedule: { select: { purchaseAmount: true, user: { select: { name: true } }, store: { select: { name: true } } } },
        deal: { select: { purchaseAmount: true, user: { select: { name: true } }, store: { select: { name: true } } } },
      },
    }),
    prisma.inquiry.count({ where: { status: 'new' } }),
    prisma.bugReport.count({ where: { status: { in: ['open', 'in_progress'] } } }),
    prisma.admin.count({ where: { status: 'pending_approval', role: { not: 'sysadmin' } } }),
    prisma.deliveryShipment.count({ where: { status: 'shipped' } }),
    prisma.user.count({ where: { storeId: null } }),
    prisma.user.count({ where: { idDocumentPath: null } }),
  ])

  const cvBreakdown = { inquiry: 0, form: 0, button: 0 }
  for (const g of cvGroups) {
    const n = g._count._all
    if (g.type === 'inquiry_submit') cvBreakdown.inquiry = n
    else if (g.type === 'form_submit') cvBreakdown.form = n
    else if (g.type === 'button_click') cvBreakdown.button = n
  }

  const result: DashboardOverview = {
    access: {
      activeVisitors: new Set(activeSessions.map(s => s.visitorId)).size,
      last7d: {
        visitors: visitorGroups.length,
        sessions: sessions7d,
        pageviews: pageviews7d,
        conversions: conversions7d,
      },
      cvBreakdown,
    },
    chat: {
      recent: chatMessages.map(m => {
        const body = (m.body ?? '').trim()
        return {
          storeId: m.room?.store?.id ?? null,
          storeName: m.room?.store?.name ?? null,
          storeCode: m.room?.store?.code ?? null,
          authorType: m.authorType,
          authorName: m.authorName,
          preview: body.length > 40 ? body.slice(0, 40) + '…' : (body || '（添付ファイル）'),
          createdAt: m.createdAt.toISOString(),
        }
      }),
    },
    contracts: {
      recent: contracts.map(c => {
        const src = c.visitSchedule ?? c.deal
        return {
          id: c.id,
          customerName: src?.user?.name ?? '（顧客不明）',
          storeName: src?.store?.name ?? null,
          amount: src?.purchaseAmount ?? null,
          agreedAt: c.agreedAt.toISOString(),
        }
      }),
    },
    alerts: {
      inquiriesNew,
      bugsOpen,
      membersPendingApproval,
      deliveriesShipped,
      unassignedCustomers,
      idMissing,
    },
  }

  return NextResponse.json(result)
}
