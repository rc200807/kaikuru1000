import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id as string
  const { id: userId } = await params

  // この店舗に紐付く顧客であることを確認
  const customer = await prisma.user.findFirst({
    where: { id: userId, storeId },
    select: { id: true, email: true, phone: true },
  })
  if (!customer) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  // 自店舗宛のお問い合わせのみ
  const inquiries = await prisma.inquiry.findMany({
    where: {
      storeId,
      OR: [
        { userId },
        ...(customer.email ? [{ email: customer.email }] : []),
        ...(customer.phone ? [{ phone: customer.phone }] : []),
      ],
    },
    include: {
      purchaseMemos: { select: { id: true, title: true, imageUrls: true, status: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ inquiries })
}
