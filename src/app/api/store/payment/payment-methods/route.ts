import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStoreOwner } from '@/lib/store-auth'
import { isStripeConfigured, requireStripe } from '@/lib/stripe'

/** 登録済みカード一覧 + デフォルトカードを返す */
export async function GET() {
  const user = await requireStoreOwner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Stripe 未設定の場合は空の一覧を返す（UI は「未設定」表示）
  if (!isStripeConfigured()) {
    return NextResponse.json({ stripeConfigured: false, paymentMethods: [], defaultPaymentMethodId: null })
  }

  const store = await prisma.store.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  })
  if (!store?.stripeCustomerId) {
    return NextResponse.json({ stripeConfigured: true, paymentMethods: [], defaultPaymentMethodId: null })
  }

  const stripe = requireStripe()
  const [methods, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: store.stripeCustomerId, type: 'card' }),
    stripe.customers.retrieve(store.stripeCustomerId),
  ])

  let defaultPaymentMethodId: string | null = null
  if (customer && !customer.deleted) {
    const c = customer as import('stripe').Stripe.Customer
    const dpm = c.invoice_settings?.default_payment_method
    defaultPaymentMethodId = typeof dpm === 'string' ? dpm : dpm?.id ?? null
  }

  return NextResponse.json({
    stripeConfigured: true,
    defaultPaymentMethodId,
    paymentMethods: methods.data.map(m => ({
      id: m.id,
      brand: m.card?.brand ?? null,
      last4: m.card?.last4 ?? null,
      expMonth: m.card?.exp_month ?? null,
      expYear: m.card?.exp_year ?? null,
      created: m.created,
    })),
  })
}
