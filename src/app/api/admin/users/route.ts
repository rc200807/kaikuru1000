import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeTestData = searchParams.get('includeTestData') === 'true'
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const where: any = {}
  if (!includeTestData) where.isTestData = false
  if (!includeInactive) where.isActive = true

  const users = await prisma.user.findMany({
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
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(users.map(({ password: _, ...u }) => u))
}
