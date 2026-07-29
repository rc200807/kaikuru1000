import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { jstMonthKey } from '@/lib/datetime'

/**
 * 店舗の支払い基盤（システム利用料の月額課金・店舗決済台帳）。
 * - 店舗ごとに Stripe Customer を持ち（Store.stripeCustomerId）、
 *   登録済みカード（デフォルト優先）へ off-session で課金する。
 * - 決済はすべて StorePayment に記録し、店舗の支払い履歴・領収書・
 *   管理ポータル「システム決済」の集計の単一ソースにする。
 */

/** 店舗の支払い用 Stripe Customer を取得（なければ作成）。billing.ts と同パターン */
export async function getOrCreateStoreBillingCustomer(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  })
  if (!store) throw new Error('店舗が見つかりません')

  if (store.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(store.stripeCustomerId)
      if (!('deleted' in customer) || !customer.deleted) return store.stripeCustomerId
    } catch {
      // retrieve 失敗（アカウント切替等）時は作り直す
    }
  }

  const customer = await stripe.customers.create({
    name: store.name,
    email: store.email ?? undefined,
    metadata: { kind: 'store-billing', storeId: store.id },
  })
  await prisma.store.update({ where: { id: storeId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

/** 課金に使うカードを解決（デフォルト指定 → なければ登録カードの先頭） */
export async function getChargeablePaymentMethodId(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId)
  if ('deleted' in customer && customer.deleted) return null
  const def = (customer as Stripe.Customer).invoice_settings?.default_payment_method
  if (typeof def === 'string') return def
  if (def?.id) return def.id
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
  return methods.data[0]?.id ?? null
}

export function billingMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${y}年${Number(m)}月分`
}

// ─── 料金項目マスタ（対応サービスごとの月額） ───

/** 初期マスタ（テーブルが空のときに遅延シード） */
const DEFAULT_FEE_SERVICES = [
  { serviceKey: 'kaikuru', label: '買いクル', monthlyAmount: 8800, sortOrder: 1 },
  { serviceKey: 'akikuru', label: 'アキクル', monthlyAmount: 8800, sortOrder: 2 },
]

/** 料金項目マスタを取得（0件なら既定の買いクル/アキクルをシード） */
export async function getSystemFeeServices() {
  const services = await prisma.systemFeeService.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  if (services.length > 0) return services
  // createMany の skipDuplicates は SQLite 非対応のため upsert（開発=SQLite/本番=PG 両対応）
  for (const s of DEFAULT_FEE_SERVICES) {
    await prisma.systemFeeService.upsert({ where: { serviceKey: s.serviceKey }, create: s, update: {} })
  }
  return prisma.systemFeeService.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
}

export type FeeBreakdownItem = { serviceKey: string; label: string; amount: number }

/**
 * 店舗の対応サービス（Store.supportedServices の生JSON）から月額を算出する。
 * マスタで isActive の項目のうち、店舗の対応キーに含まれるものを合算。
 */
export function computeStoreFee(
  supportedServicesJson: string | null | undefined,
  services: { serviceKey: string; label: string; monthlyAmount: number; isActive: boolean }[],
): { total: number; breakdown: FeeBreakdownItem[] } {
  let keys: string[] = []
  try {
    const parsed = JSON.parse(supportedServicesJson || '[]')
    if (Array.isArray(parsed)) keys = parsed.filter((k): k is string => typeof k === 'string')
  } catch { /* ignore */ }
  const breakdown = services
    .filter(s => s.isActive && s.monthlyAmount > 0 && keys.includes(s.serviceKey))
    .map(s => ({ serviceKey: s.serviceKey, label: s.label, amount: s.monthlyAmount }))
  return { total: breakdown.reduce((sum, b) => sum + b.amount, 0), breakdown }
}

type ChargeResult = { status: 'paid' | 'failed' | 'no_card' | 'skipped'; message?: string }

/**
 * StorePayment(pending) を登録カードで off-session 課金する。
 * 成功で paid、カード未登録は no_card、カードエラーは failed（failureMessage 日本語）。
 */
export async function chargeStorePayment(paymentId: string): Promise<ChargeResult> {
  const payment = await prisma.storePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, storeId: true, amount: true, status: true, billingMonth: true, kind: true },
  })
  if (!payment) return { status: 'skipped', message: '決済記録が見つかりません' }
  if (payment.status === 'paid') return { status: 'skipped' }

  const markAttempt = (data: Record<string, unknown>) =>
    prisma.storePayment.update({
      where: { id: payment.id },
      data: { ...data, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    })

  let customerId: string
  try {
    customerId = await getOrCreateStoreBillingCustomer(payment.storeId)
  } catch (e: any) {
    await markAttempt({ status: 'failed', failureMessage: `決済顧客の作成に失敗しました: ${e?.message ?? ''}` })
    return { status: 'failed', message: '決済顧客の作成に失敗しました' }
  }

  const paymentMethodId = await getChargeablePaymentMethodId(customerId)
  if (!paymentMethodId) {
    await markAttempt({ status: 'no_card', failureMessage: 'クレジットカードが登録されていません' })
    return { status: 'no_card' }
  }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: payment.amount, // JPY はゼロ小数通貨（円のまま）
        currency: 'jpy',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `システム利用料${payment.billingMonth ? `（${billingMonthLabel(payment.billingMonth)}）` : ''}`,
        metadata: {
          kind: 'store_payment',
          storePaymentId: payment.id,
          storeId: payment.storeId,
          ...(payment.billingMonth ? { billingMonth: payment.billingMonth } : {}),
        },
      },
      // Stripe 側の冪等性（同一 payment への二重課金防止の第二の砦）
      { idempotencyKey: `store-payment-${payment.id}` },
    )
    if (pi.status === 'succeeded') {
      await markAttempt({ status: 'paid', paidAt: new Date(), stripePaymentIntentId: pi.id, failureMessage: null })
      // 分配（システム管理者/本部）。失敗しても支払い自体は成立（台帳にfailedで残りリトライ可能）
      try {
        const { distributeStorePayment } = await import('@/lib/store-payment-distribution')
        await distributeStorePayment(payment.id)
      } catch (e) {
        console.error('[store-billing] 分配に失敗:', e)
      }
      return { status: 'paid' }
    }
    // requires_action（3DS必須）等 — off-session では完了できない
    await markAttempt({
      status: 'failed',
      stripePaymentIntentId: pi.id,
      failureMessage: 'カード会社の本人認証が必要です。お支払い情報ページから再決済してください',
    })
    return { status: 'failed', message: 'requires_action' }
  } catch (e: any) {
    const declineMessage =
      e?.code === 'authentication_required'
        ? 'カード会社の本人認証が必要です。お支払い情報ページから再決済してください'
        : e?.code === 'card_declined'
          ? 'カードが利用できませんでした。カード会社にご確認いただくか、別のカードを登録してください'
          : `決済に失敗しました: ${e?.message ?? '不明なエラー'}`
    await markAttempt({
      status: 'failed',
      stripePaymentIntentId: e?.payment_intent?.id ?? undefined,
      failureMessage: declineMessage,
    })
    return { status: 'failed', message: declineMessage }
  }
}

export type SystemFeeRunSummary = {
  month: string
  targets: number
  paid: number
  failed: number
  noCard: number
  skipped: number
}

/**
 * 指定月のシステム利用料を全アクティブ店舗へ課金する（cron・sysadmin手動実行の共通実装）。
 * 金額 = 店舗ごとの上書き額（SystemFeeSetting.monthlyAmount > 0）または
 *        対応サービス（Store.supportedServices × SystemFeeService）からの自動算出。
 * 冪等: StorePayment の @@unique([storeId, kind, billingMonth]) を create-first で利用し、
 * 既存が paid/pending 以外（failed/no_card）の場合のみ再課金する。
 */
export async function runSystemFeeBilling(month?: string, onlyStoreId?: string): Promise<SystemFeeRunSummary> {
  const billingMonth = month ?? jstMonthKey(new Date())
  const [settings, services] = await Promise.all([
    prisma.systemFeeSetting.findMany({
      where: { isActive: true, ...(onlyStoreId ? { storeId: onlyStoreId } : {}) },
      select: { storeId: true, monthlyAmount: true, store: { select: { supportedServices: true } } },
    }),
    getSystemFeeServices(),
  ])

  const summary: SystemFeeRunSummary = { month: billingMonth, targets: 0, paid: 0, failed: 0, noCard: 0, skipped: 0 }

  for (const setting of settings) {
    const auto = computeStoreFee(setting.store.supportedServices, services)
    const override = setting.monthlyAmount > 0
    const amount = override ? setting.monthlyAmount : auto.total
    if (amount <= 0) continue // 対応サービスなし・金額0は課金対象外
    summary.targets++

    const breakdown = override ? null : auto.breakdown
    const serviceNote = breakdown && breakdown.length > 0 ? `: ${breakdown.map(b => b.label).join('・')}` : ''
    const description = `システム利用料（${billingMonthLabel(billingMonth)}${serviceNote}）`

    // create-first（P2002 = 既に当月分がある）
    let paymentId: string
    try {
      const created = await prisma.storePayment.create({
        data: {
          storeId: setting.storeId,
          kind: 'system_fee',
          billingMonth,
          description,
          amount,
          breakdownJson: breakdown ? JSON.stringify(breakdown) : null,
          status: 'pending',
        },
        select: { id: true },
      })
      paymentId = created.id
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e
      const existing = await prisma.storePayment.findUnique({
        where: { storeId_kind_billingMonth: { storeId: setting.storeId, kind: 'system_fee', billingMonth } },
        select: { id: true, status: true },
      })
      if (!existing || existing.status === 'paid' || existing.status === 'pending') {
        summary.skipped++
        continue
      }
      // failed / no_card は再試行（最新の金額・内訳に更新して pending に戻してから課金）
      await prisma.storePayment.update({
        where: { id: existing.id },
        data: { status: 'pending', amount, description, breakdownJson: breakdown ? JSON.stringify(breakdown) : null },
      })
      paymentId = existing.id
    }

    const result = await chargeStorePayment(paymentId)
    if (result.status === 'paid') summary.paid++
    else if (result.status === 'no_card') summary.noCard++
    else if (result.status === 'failed') summary.failed++
    else summary.skipped++
  }

  return summary
}

/** 領収書番号を採番する（R-YYYYMM-NNNN。シングルトンカウンタを $transaction で +1） */
export async function allocateReceiptNumber(): Promise<string> {
  const counter = await prisma.$transaction(async (tx) => {
    await tx.receiptCounter.upsert({ where: { id: 'default' }, create: { id: 'default', last: 0 }, update: {} })
    return tx.receiptCounter.update({ where: { id: 'default' }, data: { last: { increment: 1 } } })
  })
  const ym = jstMonthKey(new Date()).replace('-', '')
  return `R-${ym}-${String(counter.last).padStart(4, '0')}`
}
