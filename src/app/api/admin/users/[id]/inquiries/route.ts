import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, phone: true } })
  if (!user) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  // userId で紐付くもの + メール/電話で同一の問い合わせも拾う
  const inquiries = await prisma.inquiry.findMany({
    where: {
      OR: [
        { userId: id },
        ...(user.email ? [{ email: user.email }] : []),
        ...(user.phone ? [{ phone: user.phone }] : []),
      ],
    },
    include: {
      store: { select: { id: true, name: true, code: true } },
      purchaseMemos: { select: { id: true, title: true, imageUrls: true, status: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ inquiries })
}
