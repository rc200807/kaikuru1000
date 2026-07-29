import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { getOrCreateStoreBillingCustomer } from '@/lib/store-billing'

export const runtime = 'nodejs'

// 店舗の支払い用クレジットカードを事前登録するための SetupIntent を発行
export async function POST() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customerId = await getOrCreateStoreBillingCustomer(user.id)
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session', // 月額課金で off-session 利用するため
      automatic_payment_methods: { enabled: true },
    })
    return NextResponse.json({ clientSecret: setupIntent.client_secret })
  } catch (e) {
    console.error('[store/billing/setup-intent] failed', e)
    return NextResponse.json({ error: 'カード登録の準備に失敗しました' }, { status: 500 })
  }
}
