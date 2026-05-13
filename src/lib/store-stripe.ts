import { prisma } from '@/lib/prisma'
import { requireStripe } from '@/lib/stripe'

/**
 * Store が Stripe Customer を未だ持っていなければ作成し、stripeCustomerId を保存する。
 * 既存の Customer がある場合はその ID を返す。サブアカウント（StoreMember）からは呼ばない前提。
 */
export async function ensureStoreStripeCustomer(storeId: string): Promise<string> {
  const stripe = requireStripe()
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      email: true,
      stripeCustomerId: true,
    },
  })
  if (!store) throw new Error('店舗が見つかりません')
  if (store.stripeCustomerId) return store.stripeCustomerId

  const customer = await stripe.customers.create({
    name: store.name,
    email: store.email ?? undefined,
    metadata: { storeId: store.id },
  })

  await prisma.store.update({
    where: { id: store.id },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}
