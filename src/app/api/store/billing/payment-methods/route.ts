import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

// 店舗の保存済みカード一覧（デフォルトカード情報つき）
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const store = await prisma.store.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } })
  if (!store?.stripeCustomerId) return NextResponse.json({ cards: [], defaultPaymentMethodId: null })

  try {
    const [methods, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: store.stripeCustomerId, type: 'card' }),
      stripe.customers.retrieve(store.stripeCustomerId),
    ])
    const def = ('deleted' in customer && customer.deleted)
      ? null
      : (customer as Stripe.Customer).invoice_settings?.default_payment_method
    const defaultPaymentMethodId = typeof def === 'string' ? def : (def?.id ?? null)
    const cards = methods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'card',
      last4: pm.card?.last4 ?? '****',
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
      isDefault: pm.id === defaultPaymentMethodId,
    }))
    return NextResponse.json({ cards, defaultPaymentMethodId })
  } catch (e) {
    console.error('[store/billing/payment-methods] list failed', e)
    return NextResponse.json({ cards: [], defaultPaymentMethodId: null })
  }
}
