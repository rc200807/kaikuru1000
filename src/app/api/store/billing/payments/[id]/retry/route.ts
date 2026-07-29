import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { getOrCreateStoreBillingCustomer } from '@/lib/store-billing'

export const runtime = 'nodejs'

/**
 * 失敗した支払いを on-session で再決済するための PaymentIntent + CustomerSession を発行。
 * フロントは PaymentElement + confirmPayment（3DS 対応）→ /sync で確定を反映する。
 * 金額は必ず DB 値（クライアント値は信用しない）。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const payment = await prisma.storePayment.findUnique({
    where: { id },
    select: { id: true, storeId: true, amount: true, status: true, description: true, billingMonth: true, stripePaymentIntentId: true },
  })
  if (!payment || payment.storeId !== user.id) return NextResponse.json({ error: '支払いが見つかりません' }, { status: 404 })
  if (payment.status === 'paid') return NextResponse.json({ error: 'この支払いは完了済みです' }, { status: 400 })

  try {
    // 二重課金防止: 既存 PI が未完了状態で残っていればキャンセルしてから発行し直す
    if (payment.stripePaymentIntentId) {
      try {
        const prev = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId)
        if (prev.status === 'succeeded') {
          await prisma.storePayment.update({
            where: { id: payment.id },
            data: { status: 'paid', paidAt: new Date(), failureMessage: null },
          })
          return NextResponse.json({ alreadyPaid: true })
        }
        if (!['canceled'].includes(prev.status)) {
          await stripe.paymentIntents.cancel(prev.id).catch(() => {})
        }
      } catch { /* 旧アカウントのPI等、retrieve不能は無視して新規発行 */ }
    }

    const customerId = await getOrCreateStoreBillingCustomer(payment.storeId)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: payment.amount,
      currency: 'jpy',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: payment.description,
      metadata: {
        kind: 'store_payment',
        storePaymentId: payment.id,
        storeId: payment.storeId,
        ...(payment.billingMonth ? { billingMonth: payment.billingMonth } : {}),
      },
    })
    // 保存済みカードの再表示（SupplyOrder フローと同形）
    const customerSession = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_save: 'enabled',
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    })
    await prisma.storePayment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: paymentIntent.id, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    })
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      customerSessionClientSecret: customerSession.client_secret,
    })
  } catch (e) {
    console.error('[store/billing/retry] failed', e)
    return NextResponse.json({ error: '再決済の準備に失敗しました' }, { status: 500 })
  }
}
