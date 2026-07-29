// システム利用料など店舗決済の回収金を Stripe Connect で2者（システム管理者/本部）に分配する。
// akikuru-distribution.ts と同じ台帳（RevenueTransfer）・同じ冪等設計。加盟店の取り分は常に0。
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { getSystemFeeShareSetting, computeShares } from '@/lib/revenue-share'

type RecipientPlan = {
  recipientType: 'system' | 'hq'
  amount: number
  /** null = プラットフォーム自身が保持（Transferしない） */
  destination: string | null
  blockedReason?: string
}

/** 支払済みPaymentIntentから分配原資となるchargeを特定する（source_transaction用） */
async function findSourceChargeId(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
    const charge = pi.latest_charge
    return typeof charge === 'string' ? charge : (charge?.id ?? null)
  } catch (e) {
    console.error('[store-payment-distribution] charge特定に失敗:', e)
    return null
  }
}

/**
 * 店舗決済の分配を実行する（冪等）。
 * - status=paid かつ distributionStatus != done のときだけ実行
 * - 受取先ごとに RevenueTransfer 台帳行を upsert（system/hq の2行）
 * - platform保持分は Transfer を作らず retained_by_platform で記録
 * - 一部失敗は partial（sysadminの分配リトライで failed 行のみ再実行）
 */
export async function distributeStorePayment(storePaymentId: string): Promise<void> {
  const payment = await prisma.storePayment.findUnique({
    where: { id: storePaymentId },
    include: { transfers: true },
  })
  if (!payment) return
  if (payment.status !== 'paid') return
  if (payment.distributionStatus === 'done') return
  if (!payment.stripePaymentIntentId) return

  const setting = await getSystemFeeShareSetting()
  const percents = { system: setting.systemPercent, hq: setting.hqPercent, store: 0 }
  const shares = computeShares(payment.amount, percents)

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
  ]

  const sourceChargeId = await findSourceChargeId(payment.stripePaymentIntentId)
  const existingByType = new Map(payment.transfers.map(t => [t.recipientType, t]))

  let anyFailed = false
  for (const plan of plans) {
    const existing = existingByType.get(plan.recipientType)
    if (existing && (existing.status === 'succeeded' || existing.status === 'retained_by_platform')) {
      continue // 完了済み行はスキップ（リトライ時の二重送金防止）
    }

    // platform保持分 or 0円の取り分（Transferしない）
    if (!plan.blockedReason && (!plan.destination || plan.amount <= 0)) {
      await upsertTransfer(payment.id, existing?.id, {
        recipientType: plan.recipientType,
        amount: Math.max(0, plan.amount),
        recipientStripeAccountId: null,
        stripeTransferId: null,
        sourceChargeId,
        status: 'retained_by_platform',
        error: null,
      })
      continue
    }

    if (plan.blockedReason) {
      anyFailed = true
      await upsertTransfer(payment.id, existing?.id, {
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

    try {
      const transfer = await stripe.transfers.create({
        amount: plan.amount,
        currency: 'jpy',
        destination: plan.destination!,
        ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
        transfer_group: `store_payment_${payment.id}`,
        metadata: {
          storePaymentId: payment.id,
          storeId: payment.storeId,
          recipientType: plan.recipientType,
        },
      })
      await upsertTransfer(payment.id, existing?.id, {
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
      console.error(`[store-payment-distribution] Transfer失敗 (${plan.recipientType}):`, message)
      await upsertTransfer(payment.id, existing?.id, {
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

  await prisma.storePayment.update({
    where: { id: payment.id },
    data: {
      distributionStatus: anyFailed ? 'partial' : 'done',
      distributionError: anyFailed ? '一部の分配に失敗しました' : null,
      distributedAt: anyFailed ? null : new Date(),
    },
  })
}

/** 支払い確定を反映し、分配まで実行する共通ヘルパー（同期確定・sync・webhook から呼ぶ） */
export async function markStorePaymentPaidAndDistribute(storePaymentId: string, stripePaymentIntentId?: string): Promise<void> {
  await prisma.storePayment.updateMany({
    where: { id: storePaymentId, status: { not: 'paid' } },
    data: {
      status: 'paid',
      paidAt: new Date(),
      failureMessage: null,
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    },
  })
  try {
    await distributeStorePayment(storePaymentId)
  } catch (e) {
    console.error('[store-payment-distribution] 分配に失敗:', e)
  }
}

async function upsertTransfer(
  storePaymentId: string,
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
    await prisma.revenueTransfer.create({ data: { storePaymentId, ...data } })
  }
}
