import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStoreOwner } from '@/lib/store-auth'
import { isStripeConfigured, requireStripe } from '@/lib/stripe'

/** デフォルトカードに設定（invoice_settings.default_payment_method） */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireStoreOwner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe が未設定です' }, { status: 503 })

  const { id } = await ctx.params
  const store = await prisma.store.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  })
  if (!store?.stripeCustomerId) {
    return NextResponse.json({ error: '登録カードがありません' }, { status: 404 })
  }

  const stripe = requireStripe()
  const method = await stripe.paymentMethods.retrieve(id)
  if (typeof method.customer !== 'string' || method.customer !== store.stripeCustomerId) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  await stripe.customers.update(store.stripeCustomerId, {
    invoice_settings: { default_payment_method: id },
  })

  return NextResponse.json({ ok: true, defaultPaymentMethodId: id })
}
