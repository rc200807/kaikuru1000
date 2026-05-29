import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
}

/**
 * 指定月の Stripe 決済手数料を集計（買いクルの備品発注分のみ）。
 * JPY はゼロ十進通貨なので fee はそのまま円。
 */
export async function computeStripeFeesForMonth(month: string): Promise<number> {
  const { start, end } = monthRange(month)
  const orders = await prisma.supplyOrder.findMany({
    where: { paymentStatus: 'paid', createdAt: { gte: start, lt: end }, stripePaymentIntentId: { not: null } },
    select: { stripePaymentIntentId: true },
  })
  let totalFee = 0
  for (const o of orders) {
    try {
      const pi = await stripe.paymentIntents.retrieve(o.stripePaymentIntentId!, { expand: ['latest_charge.balance_transaction'] })
      const charge: any = (pi as any).latest_charge
      const fee = charge?.balance_transaction?.fee
      if (typeof fee === 'number') totalFee += fee
    } catch (e) {
      console.error('[operating-costs] Stripe手数料取得失敗', o.stripePaymentIntentId, e)
    }
  }
  return totalFee
}

/**
 * 指定月の Stripe 手数料を運用コストへ自動記録（既存の自動分は置き換え）。
 */
export async function recordStripeFees(month: string): Promise<{ amount: number }> {
  const amount = await computeStripeFeesForMonth(month)
  await prisma.operatingCost.deleteMany({ where: { month, source: 'stripe' } })
  if (amount > 0) {
    await prisma.operatingCost.create({
      data: {
        month,
        category: 'stripe',
        label: 'Stripe決済手数料（自動）',
        amount,
        source: 'stripe',
        note: '備品発注の決済手数料を自動集計',
      },
    })
  }
  return { amount }
}

/**
 * 定期（毎月固定）コストを対象月へ反映。
 * 対象月より前の isRecurring 項目から (カテゴリ+項目名) ごとの最新額をテンプレにし、
 * 対象月に同一項目が無ければコピー生成する（冪等）。
 */
export async function applyRecurringCosts(month: string): Promise<{ created: number }> {
  const templates = await prisma.operatingCost.findMany({
    where: { isRecurring: true, month: { lt: month } },
    orderBy: { month: 'desc' },
  })
  const latestByKey = new Map<string, (typeof templates)[number]>()
  for (const t of templates) {
    const key = `${t.category}__${t.label}`
    if (!latestByKey.has(key)) latestByKey.set(key, t) // 降順なので最初が最新
  }

  const existing = await prisma.operatingCost.findMany({ where: { month }, select: { category: true, label: true } })
  const existingKeys = new Set(existing.map(e => `${e.category}__${e.label}`))

  let created = 0
  for (const [key, t] of latestByKey) {
    if (existingKeys.has(key)) continue
    await prisma.operatingCost.create({
      data: { month, category: t.category, label: t.label, amount: t.amount, isRecurring: true, source: 'manual', note: t.note ?? null },
    })
    created++
  }
  return { created }
}

export function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function previousMonthKey(): string {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}
