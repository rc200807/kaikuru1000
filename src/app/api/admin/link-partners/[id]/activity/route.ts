import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

const PAGE_SIZE = 50

// 連携パートナーの利用状況（活動ログのタイムライン + 直近30日のアクション別件数）
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const action = url.searchParams.get('action') || undefined
  const where = { linkPartnerId: id, ...(action ? { action } : {}) }

  // 直近30日のアクション別集計
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [logs, total, grouped, lastLog] = await Promise.all([
    prisma.linkPartnerActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        memberId: true,
        memberName: true,
        action: true,
        targetType: true,
        targetId: true,
        ip: true,
        createdAt: true,
      },
    }),
    prisma.linkPartnerActivityLog.count({ where }),
    prisma.linkPartnerActivityLog.groupBy({
      by: ['action'],
      where: { linkPartnerId: id, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.linkPartnerActivityLog.findFirst({
      where: { linkPartnerId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const byAction: Record<string, number> = {}
  for (const g of grouped) byAction[g.action] = g._count._all

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
    stats: { since: since.toISOString(), byAction, lastActivityAt: lastLog?.createdAt ?? null },
  })
}
