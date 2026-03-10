import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 店舗アカウントは自分の担当顧客のみ
  if (sessionUser.role === 'store' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const customers = await prisma.user.findMany({
    where: { storeId: id },
    select: {
      id: true, name: true, furigana: true,
      email: true, phone: true, address: true,
      idDocumentPath: true, createdAt: true,
      visitSchedules: {
        where: { visitDate: { gte: new Date() }, status: 'scheduled' },
        orderBy: { visitDate: 'asc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(customers)
}
