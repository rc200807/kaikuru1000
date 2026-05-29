import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

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
        await prisma.supplyOrder.updateMany({
          where: { id: orderId },
          data: { paymentStatus: 'paid' },
        })
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
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
