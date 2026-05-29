import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { markSupplyOrderPaidAndNotify } from '@/lib/supply-orders'

export const runtime = 'nodejs'

// 注文詳細を取得。未確定なら Stripe の PaymentIntent 状態と同期する
// （Webhook が届かない環境でも決済完了を反映できるようにするため）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  let order = await prisma.supplyOrder.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (order.paymentStatus === 'pending' && order.stripePaymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId)
      if (pi.status === 'succeeded') {
        // 支払い確定 + 初回確定時のみ Slack 通知（Webhook と二重送信しない）
        await markSupplyOrderPaidAndNotify(id)
      } else if (pi.status === 'canceled') {
        await prisma.supplyOrder.updateMany({ where: { id, paymentStatus: 'pending' }, data: { paymentStatus: 'failed' } })
      }
      // 最新状態を取得し直す
      order = (await prisma.supplyOrder.findUnique({ where: { id }, include: { items: true } })) ?? order
    } catch (e) {
      console.error('[supply-orders] PI sync failed', e)
    }
  }

  return NextResponse.json(order)
}
