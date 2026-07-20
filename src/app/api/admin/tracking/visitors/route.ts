import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import type { TrackingVisitorRow } from '@/lib/tracking-types'

export const dynamic = 'force-dynamic'

// 訪問者一覧（?page=1&cvOnly=1&q=検索）
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const pageSize = 50
  const cvOnly = sp.get('cvOnly') === '1'
  const q = (sp.get('q') ?? '').trim()

  const where: Record<string, unknown> = {}
  const userId = sp.get('userId')
  if (userId) where.userId = userId
  if (cvOnly) where.events = { some: { isConversion: true } }
  if (q) {
    where.OR = [
      { visitorKey: { contains: q } },
      { user: { name: { contains: q } } },
      { firstUrl: { contains: q } },
    ]
  }

  const [total, visitors] = await Promise.all([
    prisma.trackingVisitor.count({ where }),
    prisma.trackingVisitor.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { sessions: true } },
        sessions: { orderBy: { startedAt: 'desc' }, take: 1, select: { channel: true, deviceType: true, region: true, city: true } },
        events: { where: { isConversion: true }, select: { id: true }, take: 100 },
      },
    }),
  ])

  const rows: TrackingVisitorRow[] = visitors.map(v => ({
    id: v.id,
    visitorKey: v.visitorKey,
    firstSeenAt: v.firstSeenAt.toISOString(),
    lastSeenAt: v.lastSeenAt.toISOString(),
    firstReferrer: v.firstReferrer,
    channel: v.sessions[0]?.channel ?? null,
    deviceType: v.sessions[0]?.deviceType ?? null,
    region: v.sessions[0]?.region ?? null,
    sessionCount: v._count.sessions,
    conversionCount: v.events.length,
    customerName: v.user?.name ?? null,
    userId: v.user?.id ?? null,
  }))

  return NextResponse.json({ visitors: rows, total, page, pageSize })
}
