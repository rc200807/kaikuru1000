import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, code: true,
      prefecture: true, address: true, phone: true, email: true,
      _count: { select: { customers: true } },
    },
    orderBy: { code: 'asc' },
  })
  return NextResponse.json(stores)
}
