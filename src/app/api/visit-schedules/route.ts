import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 訪問スケジュール一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')
  const userId = searchParams.get('userId')

  const where: any = {}
  if (storeId) where.storeId = storeId
  if (userId) where.userId = userId
  if (sessionUser.role === 'customer') where.userId = sessionUser.id
  if (sessionUser.role === 'store') where.storeId = sessionUser.id

  const schedules = await prisma.visitSchedule.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, address: true, phone: true } },
      store: { select: { id: true, name: true } },
    },
    orderBy: { visitDate: 'asc' },
  })

  return NextResponse.json(schedules)
}

// 訪問スケジュール登録（店舗・管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { userId, storeId, visitDate, note } = body

  if (!userId || !storeId || !visitDate) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.create({
    data: {
      userId, storeId,
      visitDate: new Date(visitDate),
      note,
      status: 'scheduled',
    },
    include: {
      user: { select: { name: true } },
      store: { select: { name: true } },
    },
  })

  return NextResponse.json(schedule, { status: 201 })
}
