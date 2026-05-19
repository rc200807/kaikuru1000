import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId') || ''
  const q = (searchParams.get('q') || '').trim()

  const where: any = {}
  if (storeId) where.storeId = storeId
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ]
  }

  const members = await prisma.storeMember.findMany({
    where,
    select: {
      id: true,
      storeId: true,
      name: true,
      email: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
      store: { select: { id: true, name: true, code: true, prefecture: true } },
    },
    orderBy: [{ store: { name: 'asc' } }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ members, total: members.length })
}
