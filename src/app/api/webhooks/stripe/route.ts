import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { markSupplyOrderPaidAndNotify } from '@/lib/supply-orders'
import { distributeAkikuruInvoice } from '@/lib/akikuru-distribution'
import { syncConnectAccountStatus } from '@/lib/stripe-connect'

export const runtime = 'nodejs'

// Stripe Webhook（署名検証 + 冪等化）
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const rawBody = await req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (e: any) {
    console.error('[stripe-webhook] signature verification failed', e.message)
    return NextResponse.json({ error: `Webhook Error: ${e.message}` }, { status: 400 })
  }

  // 冪等性: 同じ event を二重処理しない
  const already = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } })
  if (already) return NextResponse.json({ received: true, duplicate: true })
  await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } })

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as any
      const orderId = pi.metadata?.supplyOrderId
      if (orderId) {
        // 支払い確定 + 初回確定時のみ Slack 通知
        await markSupplyOrderPaidAndNotify(orderId)
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as any
      const orderId = pi.metadata?.supplyOrderId
      if (orderId) {
        await prisma.supplyOrder.updateMany({
          where: { id: orderId, paymentStatus: 'pending' },
          data: { paymentStatus: 'failed' },
        })
      }
    } else if (event.type === 'invoice.paid') {
      // アキクル請求の支払確定 → 分配実行
      const invoice = event.data.object as any
      if (invoice.metadata?.kind === 'akikuru') {
        // 支払方法（card / customer_balance）と PaymentIntent を可能な範囲で記録
        const payment = invoice.payments?.data?.find((p: any) => p?.status === 'paid')
        const pi = payment?.payment?.payment_intent
        const paymentIntentId = typeof pi === 'string' ? pi : (pi?.id ?? null)
        const updated = await prisma.akikuruInvoice.updateMany({
          where: { stripeInvoiceId: invoice.id, status: { not: 'paid' } },
          data: {
            status: 'paid',
            paidAt: new Date(),
            stripePaymentIntentId: paymentIntentId,
            stripeInvoicePdfUrl: invoice.invoice_pdf ?? undefined,
          },
        })
        if (updated.count > 0) {
          const record = await prisma.akikuruInvoice.findUnique({ where: { stripeInvoiceId: invoice.id }, select: { id: true } })
          if (record) await distributeAkikuruInvoice(record.id)
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any
      if (invoice.metadata?.kind === 'akikuru') {
        await prisma.akikuruInvoice.updateMany({
          where: { stripeInvoiceId: invoice.id, status: 'open' },
          data: { status: 'payment_failed' },
        })
      }
    } else if (event.type === 'invoice.voided' || event.type === 'invoice.marked_uncollectible') {
      const invoice = event.data.object as any
      if (invoice.metadata?.kind === 'akikuru') {
        await prisma.akikuruInvoice.updateMany({
          where: { stripeInvoiceId: invoice.id, status: { not: 'paid' } },
          data: { status: event.type === 'invoice.voided' ? 'void' : 'uncollectible' },
        })
      }
    } else if (event.type === 'payment_intent.partially_funded') {
      // 銀行振込の一部入金（全額到達まで invoice.paid は発火しない）。内部ログのみ
      const pi = event.data.object as any
      console.warn('[stripe-webhook] 銀行振込の一部入金を検知:', pi.id, pi.amount_received, '/', pi.amount)
    } else if (event.type === 'account.updated') {
      // Connect アカウントの状態同期（加盟店オンボーディング進捗）
      const account = event.data.object as any
      await syncConnectAccountStatus(account)
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
