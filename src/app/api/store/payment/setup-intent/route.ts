import { NextResponse } from 'next/server'
import { requireStoreOwner } from '@/lib/store-auth'
import { isStripeConfigured, requireStripe } from '@/lib/stripe'
import { ensureStoreStripeCustomer } from '@/lib/store-stripe'

/** カード登録用の SetupIntent を作成し、clientSecret を返す */
export async function POST() {
  const user = await requireStoreOwner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe が未設定です（管理者にお問い合わせください）' }, { status: 503 })
  }

  const stripe = requireStripe()
  const customerId = await ensureStoreStripeCustomer(user.id)
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  })

  return NextResponse.json({
    clientSecret: intent.client_secret,
    customerId,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  })
}
