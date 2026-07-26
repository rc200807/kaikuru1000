// アキクル請求の回収金をStripe Connectで3者（システム管理者/本部/加盟店）に分配する。
// invoice.paid webhook と sysadmin の手動リトライAPIの両方から呼ばれる。
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { getRevenueShareSetting, computeShares } from '@/lib/revenue-share'

type RecipientPlan = {
  recipientType: 'system' | 'hq' | 'store'
  amount: number
  /** null = プラットフォーム自身が保持（Transferしない） */
  destination: string | null
  /** destination が必要なのに未設定・未オンボーディングの場合のエラー文言 */
  blockedReason?: string
}

/** 支払済みinvoiceから分配原資となるchargeを特定する（source_transaction用） */
async function findSourceChargeId(stripeInvoiceId: string): Promise<string | null> {
  try {
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId, {
      expand: ['payments.data.payment.payment_intent.latest_charge'],
    })
    const payments = (invoice as any).payments?.data ?? []
    for (const p of payments) {
      if (p?.status !== 'paid') continue
      const pi = p?.payment?.payment_intent
      const charge = typeof pi === 'object' ? pi?.latest_charge : null
      const chargeId = typeof charge === 'string' ? charge : charge?.id
      if (chargeId) return chargeId
    }
  } catch (e) {
    console.error('[akikuru-distribution] charge特定に失敗:', e)
  }
  return null
}

/**
 * 分配を実行する（冪等）。
 * - distributionStatus が done の場合は何もしない
 * - 受取先ごとに RevenueTransfer 台帳行を upsert し、成功/失敗を記録
 * - platform保持分は Transfer を作らず retained_by_platform で記録（台帳上は常に3行揃う）
 * - 一部失敗は partial（後から retryDistribution で failed 行のみ再実行できる）
 */
export async function distributeAkikuruInvoice(akikuruInvoiceId: string): Promise<void> {
  const invoice = await prisma.akikuruInvoice.findUnique({
    where: { id: akikuruInvoiceId },
    include: {
      store: { select: { id: true, name: true, stripeConnectAccountId: true, stripeConnectStatus: true } },
      transfers: true,
    },
  })
  if (!invoice) return
  if (invoice.status !== 'paid') return
  if (invoice.distributionStatus === 'done') return

  const setting = await getRevenueShareSetting()
  const percents = { system: setting.systemPercent, hq: setting.hqPercent, store: setting.storePercent }
  const shares = computeShares(invoice.amount, percents)

  const storeAcct = invoice.store?.stripeConnectAccountId ?? null
  const storeReady = !!storeAcct && invoice.store?.stripeConnectStatus === 'active'

  const plans: RecipientPlan[] = [
    {
      recipientType: 'system',
      amount: shares.system,
      destination: setting.systemRecipientType === 'connect' ? (setting.systemStripeAccountId ?? null) : null,
      blockedReason: setting.systemRecipientType === 'connect' && !setting.systemStripeAccountId
        ? 'システム管理者のConnectアカウントが未設定です' : undefined,
    },
    {
      recipientType: 'hq',
      amount: shares.hq,
      destination: setting.hqRecipientType === 'connect' ? (setting.hqStripeAccountId ?? null) : null,
      blockedReason: setting.hqRecipientType === 'connect' && !setting.hqStripeAccountId
        ? '本部のConnectアカウントが未設定です' : undefined,
    },
    {
      recipientType: 'store',
      amount: shares.store,
      destination: storeAcct,
      blockedReason: !invoice.store
        ? '担当店舗が設定されていません'
        : !storeReady
          ? `店舗「${invoice.store.name}」のStripe Connectオンボーディングが未完了です`
          : undefined,
    },
  ]

  const sourceChargeId = await findSourceChargeId(invoice.stripeInvoiceId)
  const existingByType = new Map(invoice.transfers.map(t => [t.recipientType, t]))

  let anyFailed = false
  for (const plan of plans) {
    const existing = existingByType.get(plan.recipientType)
    if (existing && (existing.status === 'succeeded' || existing.status === 'retained_by_platform')) {
      continue // 既に完了済みの行はスキップ（リトライ時の二重送金防止）
    }

    // platform保持分（Transferしない）
    if (!plan.destination && !plan.blockedReason) {
      await upsertTransfer(invoice.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: plan.amount,
        recipientStripeAccountId: null,
        stripeTransferId: null,
        sourceChargeId,
        status: 'retained_by_platform',
        error: null,
      })
      continue
    }

    // 送金先が未設定・未オンボーディング
    if (plan.blockedReason) {
      anyFailed = true
      await upsertTransfer(invoice.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: plan.amount,
        recipientStripeAccountId: plan.destination,
        stripeTransferId: null,
        sourceChargeId,
        status: 'failed',
        error: plan.blockedReason,
      })
      continue
    }

    // 0円の取り分はTransfer不要（記録だけ残す）
    if (plan.amount <= 0) {
      await upsertTransfer(invoice.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: 0,
        recipientStripeAccountId: plan.destination,
        stripeTransferId: null,
        sourceChargeId,
        status: 'retained_by_platform',
        error: null,
      })
      continue
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: plan.amount,
        currency: 'jpy',
        destination: plan.destination!,
        // source_transaction を指定すると、そのchargeの入金原資に紐づき残高available待ちが不要になる。
        // customer_balance 由来のchargeで使えない場合は残高不足エラー→failed→リトライで回収する。
        ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
        transfer_group: `akikuru_${invoice.dealId}`,
        metadata: {
          akikuruInvoiceId: invoice.id,
          dealId: invoice.dealId,
          recipientType: plan.recipientType,
        },
      })
      await upsertTransfer(invoice.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: plan.amount,
        recipientStripeAccountId: plan.destination,
        stripeTransferId: transfer.id,
        sourceChargeId,
        status: 'succeeded',
        error: null,
      })
    } catch (e) {
      anyFailed = true
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[akikuru-distribution] Transfer失敗 (${plan.recipientType}):`, message)
      await upsertTransfer(invoice.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: plan.amount,
        recipientStripeAccountId: plan.destination,
        stripeTransferId: null,
        sourceChargeId,
        status: 'failed',
        error: message,
      })
    }
  }

  await prisma.akikuruInvoice.update({
    where: { id: invoice.id },
    data: {
      distributionStatus: anyFailed ? 'partial' : 'done',
      distributionError: anyFailed ? '一部の分配に失敗しました（分配台帳を確認してください）' : null,
      distributedAt: anyFailed ? null : new Date(),
      sharePercentsJson: JSON.stringify(percents),
    },
  })
}

async function upsertTransfer(
  akikuruInvoiceId: string,
  existingId: string | undefined,
  data: {
    recipientType: string
    amount: number
    recipientStripeAccountId: string | null
    stripeTransferId: string | null
    sourceChargeId: string | null
    status: string
    error: string | null
  },
) {
  if (existingId) {
    await prisma.revenueTransfer.update({ where: { id: existingId }, data })
  } else {
    await prisma.revenueTransfer.create({ data: { akikuruInvoiceId, ...data } })
  }
}
