import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

// システム決済（店舗の支払い）の決済記録一覧（フィルタ・ページング）
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const status = sp.get('status')
  const month = sp.get('month')
  const storeId = sp.get('storeId')

  const where = {
    ...(status ? (status === 'unresolved' ? { status: { in: ['failed', 'no_card'] } } : { status }) : {}),
    ...(month ? { billingMonth: month } : {}),
    ...(storeId ? { storeId } : {}),
  }

  const [total, payments] = await Promise.all([
    prisma.storePayment.count({ where }),
    prisma.storePayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, kind: true, billingMonth: true, description: true, amount: true, status: true,
        failureMessage: true, paidAt: true, receiptNumber: true, createdAt: true,
        store: { select: { id: true, name: true, code: true } },
      },
    }),
  ])
  return NextResponse.json({ payments, total, page, pageSize: PAGE_SIZE })
}
