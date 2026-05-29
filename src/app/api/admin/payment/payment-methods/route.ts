import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// 本部の保存済みカード一覧
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.supplyBillingAccount.findUnique({ where: { id: 'default' } })
  if (!account?.stripeCustomerId) {
    return NextResponse.json([])
  }

  try {
    const methods = await stripe.paymentMethods.list({
      customer: account.stripeCustomerId,
      type: 'card',
    })
    const cards = methods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'card',
      last4: pm.card?.last4 ?? '****',
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    }))
    return NextResponse.json(cards)
  } catch (e) {
    console.error('[payment-methods] list failed', e)
    return NextResponse.json([])
  }
}
