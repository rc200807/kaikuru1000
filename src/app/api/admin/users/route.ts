import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminUsersWhere, parseCustomerSort } from '@/lib/customer-list-query'
import { getTrackedChannels } from '@/lib/customer-tracking'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))

  const where = buildAdminUsersWhere(searchParams)
  const orderBy = parseCustomerSort(searchParams, { createdAt: 'desc' })

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        licenseKey: { select: { key: true } },
        visitSchedules: {
          where: { visitDate: { gte: new Date() }, status: 'scheduled' },
          orderBy: { visitDate: 'asc' },
          take: 1,
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  const trackedChannels = await getTrackedChannels(users.map(u => u.id))

  return NextResponse.json({
    users: users.map(({ password: _, ...u }) => ({ ...u, trackedChannel: trackedChannels[u.id] ?? null })),
    total,
    page,
    limit,
  })
}
