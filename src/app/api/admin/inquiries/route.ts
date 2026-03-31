import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')

  const where = storeId ? { storeId } : {}

  const inquiries = await prisma.inquiry.findMany({
    where,
    include: {
      store: { select: { id: true, name: true, code: true } },
      user: {
        select: { id: true, name: true, email: true, phone: true, customerType: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(inquiries)
}
