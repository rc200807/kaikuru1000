import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const PAGE_SIZE = 20

// 自店舗の支払い履歴（新しい順・ページング）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
  const where = { storeId: user.id as string }
  const [total, payments] = await Promise.all([
    prisma.storePayment.count({ where }),
    prisma.storePayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, kind: true, billingMonth: true, description: true, amount: true, status: true,
        failureMessage: true, paidAt: true, receiptNumber: true, receiptName: true, receiptIssuedAt: true,
        createdAt: true,
      },
    }),
  ])
  return NextResponse.json({ payments, total, page, pageSize: PAGE_SIZE })
}
