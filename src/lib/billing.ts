import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

const BILLING_ACCOUNT_ID = 'default'

/**
 * 本部の備品決済用 Stripe 顧客を取得（なければ作成）。
 * SupplyBillingAccount をシングルトン（id="default"）で運用する。
 */
export async function getOrCreateBillingCustomer(): Promise<string> {
  const account = await prisma.supplyBillingAccount.findUnique({
    where: { id: BILLING_ACCOUNT_ID },
  })

  if (account?.stripeCustomerId) {
    // Stripe 側に存在するか軽く確認（削除済みなら作り直す）
    try {
      const customer = await stripe.customers.retrieve(account.stripeCustomerId)
      if (!('deleted' in customer) || !customer.deleted) {
        return account.stripeCustomerId
      }
    } catch {
      // retrieve 失敗時は作り直す
    }
  }

  const customer = await stripe.customers.create({
    name: '買いクル 本部（備品発注）',
    metadata: { kind: 'supply-billing', accountId: BILLING_ACCOUNT_ID },
  })

  await prisma.supplyBillingAccount.upsert({
    where: { id: BILLING_ACCOUNT_ID },
    create: { id: BILLING_ACCOUNT_ID, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  })

  return customer.id
}
