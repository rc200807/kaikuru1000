import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 訪問リクエスト一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const where: any = {}
  if (sessionUser.role === 'customer') where.userId = sessionUser.id
  if (sessionUser.role === 'store') where.storeId = sessionUser.id
  if (status) {
    const statuses = status.split(',').map(s => s.trim())
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses }
  }

  const requests = await prisma.visitRequest.findMany({
    where,
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

// 訪問リクエスト作成（顧客のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    candidate1Date, candidate1Start, candidate1End,
    candidate2Date, candidate2Start, candidate2End,
    candidate3Date, candidate3Start, candidate3End,
    customerNote,
  } = body

  // 顧客の担当店舗を取得
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { storeId: true },
  })

  if (!user?.storeId) {
    return NextResponse.json({ error: '店舗が割り当てられていません' }, { status: 400 })
  }

  const visitRequest = await prisma.visitRequest.create({
    data: {
      userId: sessionUser.id,
      storeId: user.storeId,
      candidate1Date: new Date(candidate1Date),
      candidate1Start: candidate1Start || null,
      candidate1End: candidate1End || null,
      candidate2Date: new Date(candidate2Date),
      candidate2Start: candidate2Start || null,
      candidate2End: candidate2End || null,
      candidate3Date: new Date(candidate3Date),
      candidate3Start: candidate3Start || null,
      candidate3End: candidate3End || null,
      customerNote: customerNote || null,
      status: 'pending',
    },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { name: true } },
    },
  })

  return NextResponse.json(visitRequest, { status: 201 })
}
