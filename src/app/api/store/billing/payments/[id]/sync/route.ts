import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// PaymentIntent の状態を取得して支払い確定を反映（webhook 不達時のフォールバック）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const payment = await prisma.storePayment.findUnique({
    where: { id },
    select: { id: true, storeId: true, status: true, stripePaymentIntentId: true },
  })
  if (!payment || payment.storeId !== user.id) return NextResponse.json({ error: '支払いが見つかりません' }, { status: 404 })
  if (payment.status === 'paid') return NextResponse.json({ status: 'paid' })
  if (!payment.stripePaymentIntentId) return NextResponse.json({ status: payment.status })

  try {
    const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId)
    if (pi.status === 'succeeded') {
      await prisma.storePayment.updateMany({
        where: { id: payment.id, status: { not: 'paid' } },
        data: { status: 'paid', paidAt: new Date(), failureMessage: null },
      })
      return NextResponse.json({ status: 'paid' })
    }
    if (pi.status === 'canceled') {
      await prisma.storePayment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'failed', failureMessage: '決済がキャンセルされました' },
      })
      return NextResponse.json({ status: 'failed' })
    }
    return NextResponse.json({ status: payment.status, stripeStatus: pi.status })
  } catch (e) {
    console.error('[store/billing/sync] failed', e)
    return NextResponse.json({ error: '支払い状況の確認に失敗しました' }, { status: 500 })
  }
}
