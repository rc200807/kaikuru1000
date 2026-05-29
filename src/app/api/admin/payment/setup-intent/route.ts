import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { getOrCreateBillingCustomer } from '@/lib/billing'

export const runtime = 'nodejs'

// 備品発注用のクレジットカードを事前登録するための SetupIntent を発行
export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateBillingCustomer()
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true },
    })
    return NextResponse.json({ clientSecret: setupIntent.client_secret })
  } catch (e) {
    console.error('[payment/setup-intent] failed', e)
    return NextResponse.json({ error: 'カード登録の準備に失敗しました。Stripe の設定を確認してください' }, { status: 500 })
  }
}
