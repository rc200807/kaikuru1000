import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = 50
  const userType = searchParams.get('userType') || undefined
  const activeOnly = searchParams.get('active') === '1'
  const now = new Date()

  const activeWhere = { revokedAt: null, expiresAt: { gt: now } }
  const listWhere = {
    ...(userType ? { userType } : {}),
    ...(activeOnly ? activeWhere : {}),
  }

  const [activeTotal, byType, items, total] = await Promise.all([
    prisma.deviceSession.count({ where: activeWhere }),
    prisma.deviceSession.groupBy({ by: ['userType'], where: activeWhere, _count: { _all: true } }),
    prisma.deviceSession.findMany({
      where: listWhere,
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, userType: true, userId: true, loginMethod: true, ip: true, userAgent: true,
        lastSeenAt: true, createdAt: true, expiresAt: true, revokedAt: true,
      },
    }),
    prisma.deviceSession.count({ where: listWhere }),
  ])

  return NextResponse.json({
    summary: {
      activeTotal,
      byType: byType.map(t => ({ userType: t.userType, count: t._count._all })),
    },
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
