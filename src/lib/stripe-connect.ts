// Stripe Connect（加盟店の分配受取用 Express アカウント）ヘルパー
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

/**
 * 店舗の Connect Express アカウントを取得（なければ作成して Store に保存）。
 * 送金受取専用のため capabilities は transfers のみ要求する。
 */
export async function getOrCreateConnectAccount(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, email: true, stripeConnectAccountId: true },
  })
  if (!store) throw new Error('店舗が見つかりません')

  if (store.stripeConnectAccountId) {
    try {
      const acct = await stripe.accounts.retrieve(store.stripeConnectAccountId)
      if (acct?.id) return acct.id
    } catch {
      // 削除済み等なら作り直す
    }
  }

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'JP',
    email: store.email ?? undefined,
    capabilities: { transfers: { requested: true } },
    business_profile: { name: store.name },
    metadata: { storeId: store.id },
  })

  await prisma.store.update({
    where: { id: storeId },
    data: { stripeConnectAccountId: account.id, stripeConnectStatus: 'onboarding' },
  })
  return account.id
}

/** オンボーディング用アカウントリンクを発行（短命・使い捨て。必要のたびに再発行する） */
export async function createOnboardingLink(accountId: string, storeId: string): Promise<string> {
  const base = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/admin/stores/${storeId}?connect=refresh`,
    return_url: `${base}/admin/stores/${storeId}?connect=done`,
    type: 'account_onboarding',
  })
  return link.url
}

/** account.updated webhook からの Connect 状態同期 */
export async function syncConnectAccountStatus(account: {
  id: string
  charges_enabled?: boolean
  payouts_enabled?: boolean
  capabilities?: { transfers?: string | null } | null
  requirements?: { disabled_reason?: string | null } | null
}) {
  const store = await prisma.store.findUnique({
    where: { stripeConnectAccountId: account.id },
    select: { id: true, stripeConnectOnboardedAt: true },
  })
  if (!store) return

  const transfersActive = account.capabilities?.transfers === 'active'
  const disabled = !!account.requirements?.disabled_reason
  const status = transfersActive ? 'active' : disabled ? 'restricted' : 'onboarding'

  await prisma.store.update({
    where: { id: store.id },
    data: {
      stripeConnectStatus: status,
      stripeConnectChargesEnabled: !!account.charges_enabled,
      stripeConnectPayoutsEnabled: !!account.payouts_enabled,
      ...(transfersActive && !store.stripeConnectOnboardedAt
        ? { stripeConnectOnboardedAt: new Date() }
        : {}),
    },
  })
}
