import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: 店舗の問い合わせ一覧を取得（storeCode付き）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const where: any = { storeId }
  if (status && status !== 'all') {
    where.status = status
  }

  const [inquiries, store] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, customerType: true },
        },
        purchaseMemos: {
          select: { id: true, title: true, imageUrls: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { code: true },
    }),
  ])

  return NextResponse.json({ inquiries, storeCode: store?.code ?? '' })
}

// PATCH: 問い合わせのステータス更新
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const body = await request.json()
  const { inquiryId, status } = body

  if (!inquiryId || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const validStatuses = ['new', 'contacted', 'completed']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, storeId },
  })
  if (!inquiry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { status },
  })

  return NextResponse.json(updated)
}
