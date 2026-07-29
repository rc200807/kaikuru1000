import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { distributeStorePayment } from '@/lib/store-payment-distribution'

export const runtime = 'nodejs'

// システム利用料の分配リトライ（{ paymentId }）。失敗した台帳行のみ再実行される
export async function POST(request: NextRequest) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : null
  if (!paymentId) return NextResponse.json({ error: 'paymentId を指定してください' }, { status: 400 })

  const payment = await prisma.storePayment.findUnique({ where: { id: paymentId }, select: { id: true, status: true } })
  if (!payment) return NextResponse.json({ error: '決済が見つかりません' }, { status: 404 })
  if (payment.status !== 'paid') return NextResponse.json({ error: '支払済みの決済のみ分配できます' }, { status: 400 })

  await distributeStorePayment(paymentId)

  const updated = await prisma.storePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, distributionStatus: true, distributionError: true, transfers: { orderBy: { createdAt: 'asc' } } },
  })
  await recordAccessLog({ userType: 'sysadmin', userId: admin.id, userName: admin.name, action: 'システム利用料の分配をリトライ', req: request })
  return NextResponse.json(updated)
}
