import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { sinceHours } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = 50
  const onlyBlocked = searchParams.get('onlyBlocked') === '1'
  const now = new Date()

  const where = onlyBlocked ? { blockedUntil: { gt: now } } : { failCount: { gt: 0 } }

  const [blockedNow, failing24h, items, total] = await Promise.all([
    prisma.loginAttempt.count({ where: { blockedUntil: { gt: now } } }),
    prisma.loginAttempt.count({ where: { failCount: { gt: 0 }, updatedAt: { gte: sinceHours(24) } } }),
    prisma.loginAttempt.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, key: true, failCount: true, firstFailAt: true, blockedUntil: true, updatedAt: true },
    }),
    prisma.loginAttempt.count({ where }),
  ])

  return NextResponse.json({
    summary: { blockedNow, failing24h },
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
