import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries } from '@/lib/analytics/period'
import { DEAL_CATEGORY_LABEL, DEAL_CATEGORIES } from '@/lib/deal-categories'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveAnalyticsParams, dealWhere, dateWhere, buildMeta, fetchStoreMap, WON_STATUSES,
} from '../_lib/params'

export const dynamic = 'force-dynamic'

const AMOUNT_BINS = [
  { label: '〜1万円', max: 10_000 },
  { label: '1〜5万円', max: 50_000 },
  { label: '5〜10万円', max: 100_000 },
  { label: '10〜30万円', max: 300_000 },
  { label: '30〜50万円', max: 500_000 },
  { label: '50万円〜', max: Infinity },
]

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  draft: '下書き', registered: '登録済', shipped: '発送済', received: '到着済', appraised: '査定済', transferred: '振込済',
}

// 売上・買取タブ: 金額分析・品目カテゴリー・宅配買取・店舗別売上
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, granularity, filters } = params

  // 買取品目は案件経由で storeId フィルタを適用（案件未紐付けの品目は対象外になる）
  const purchaseItemWhere = {
    createdAt: dateWhere(range),
    ...(filters.storeId ? { deal: { storeId: filters.storeId } } : {}),
  }

  const [
    deals, purchaseItems, categories, estimateCount, contractCount, deliveries, storeMap,
    prevDeals,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: dealWhere(range, filters),
      select: {
        occurredAt: true, purchaseAmount: true, billingAmount: true, status: true,
        category: true, storeId: true, purchaseUpliftPercent: true,
      },
    }),
    prisma.purchaseItem.findMany({
      where: purchaseItemWhere,
      select: { purchasePrice: true, quantity: true, categoryId: true, category: true },
    }),
    prisma.purchaseCategory.findMany({ select: { id: true, name: true } }),
    prisma.estimate.count({ where: { createdAt: dateWhere(range) } }),
    prisma.salesContract.count({ where: { agreedAt: dateWhere(range) } }),
    prisma.deliveryShipment.findMany({
      where: { createdAt: dateWhere(range) },
      select: { status: true, purchaseAmount: true, shipmentMonth: true },
    }),
    fetchStoreMap(),
    compare
      ? prisma.deal.findMany({
          where: dealWhere(compare, filters),
          select: { purchaseAmount: true, billingAmount: true, status: true, purchaseUpliftPercent: true },
        })
      : Promise.resolve(null),
  ])

  const isWon = (s: string) => WON_STATUSES.includes(s)
  const wonDeals = deals.filter(d => isWon(d.status))
  const sumPurchase = wonDeals.reduce((s, d) => s + (d.purchaseAmount ?? 0), 0)
  const sumBilling = wonDeals.reduce((s, d) => s + (d.billingAmount ?? 0), 0)
  const avgDealAmount = wonDeals.length > 0 ? sumPurchase / wonDeals.length : 0
  const upliftDeals = wonDeals.filter(d => d.purchaseUpliftPercent > 0).length
  const upliftRate = wonDeals.length > 0 ? upliftDeals / wonDeals.length : 0
  const estimateConversion = estimateCount > 0 ? contractCount / estimateCount : 0

  const prevWon = (prevDeals ?? []).filter(d => isWon(d.status))
  const prevSumPurchase = prevDeals ? prevWon.reduce((s, d) => s + (d.purchaseAmount ?? 0), 0) : null
  const prevSumBilling = prevDeals ? prevWon.reduce((s, d) => s + (d.billingAmount ?? 0), 0) : null
  const prevAvg = prevDeals ? (prevWon.length > 0 ? (prevSumPurchase ?? 0) / prevWon.length : 0) : null

  // 時系列: 買取 vs 請求
  const buckets = buildBuckets(range, granularity)
  const purchaseSeries = fillSeries(buckets, wonDeals, granularity, d => d.occurredAt, d => d.purchaseAmount ?? 0)
  const billingSeries = fillSeries(buckets, wonDeals, granularity, d => d.occurredAt, d => d.billingAmount ?? 0)
  const amounts: SeriesPoint[] = buckets.map((b, i) => ({
    label: b.label, purchase: purchaseSeries[i], billing: billingSeries[i],
  }))

  // 時系列: カテゴリー別買取金額（積み上げ）
  const byCategory = new Map(DEAL_CATEGORIES.map(c => [
    c,
    fillSeries(buckets, wonDeals.filter(d => d.category === c), granularity, d => d.occurredAt, d => d.purchaseAmount ?? 0),
  ]))
  const categoryAmounts: SeriesPoint[] = buckets.map((b, i) => {
    const point: SeriesPoint = { label: b.label }
    for (const c of DEAL_CATEGORIES) point[c] = byCategory.get(c)?.[i] ?? 0
    return point
  })

  // 品目カテゴリー別 金額 TOP15（purchasePrice × quantity）
  const categoryNameMap = new Map(categories.map(c => [c.id, c.name]))
  const itemCatAgg = new Map<string, { count: number; amount: number }>()
  for (const item of purchaseItems) {
    const name = (item.categoryId ? categoryNameMap.get(item.categoryId) : null) ?? item.category ?? '未分類'
    const cur = itemCatAgg.get(name) ?? { count: 0, amount: 0 }
    cur.count += item.quantity
    cur.amount += item.purchasePrice * item.quantity
    itemCatAgg.set(name, cur)
  }
  const itemCategories = [...itemCatAgg.entries()]
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)

  // 案件金額帯ヒストグラム（成約案件）
  const histogram = AMOUNT_BINS.map(bin => ({ name: bin.label, count: 0 }))
  for (const d of wonDeals) {
    const amount = d.purchaseAmount ?? 0
    const idx = AMOUNT_BINS.findIndex(bin => amount < bin.max)
    histogram[idx === -1 ? AMOUNT_BINS.length - 1 : idx].count++
  }

  // 宅配買取: ステータスファネル + 月次金額
  const deliveryStatusOrder = ['draft', 'registered', 'shipped', 'received', 'appraised', 'transferred']
  const deliveryFunnel = deliveryStatusOrder.map(status => ({
    name: DELIVERY_STATUS_LABEL[status] ?? status,
    count: deliveries.filter(d => d.status === status).length,
  }))
  const deliveryMonthAgg = new Map<string, number>()
  for (const d of deliveries) {
    if (d.purchaseAmount == null) continue
    deliveryMonthAgg.set(d.shipmentMonth, (deliveryMonthAgg.get(d.shipmentMonth) ?? 0) + d.purchaseAmount)
  }
  const deliveryMonthly = [...deliveryMonthAgg.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, amount]) => ({ label: month, amount }))

  // 高額案件 TOP20
  const topDeals = await prisma.deal.findMany({
    where: { ...dealWhere(range, filters), status: { in: WON_STATUSES }, purchaseAmount: { not: null } },
    orderBy: { purchaseAmount: 'desc' },
    take: 20,
    select: {
      id: true, purchaseAmount: true, billingAmount: true, occurredAt: true, category: true,
      user: { select: { name: true } }, store: { select: { name: true } },
    },
  })

  // 店舗別売上表
  const storePerf = new Map<string, { deals: number; won: number; purchase: number; billing: number }>()
  for (const d of deals) {
    const key = d.storeId ?? '__none__'
    const cur = storePerf.get(key) ?? { deals: 0, won: 0, purchase: 0, billing: 0 }
    cur.deals++
    if (isWon(d.status)) {
      cur.won++
      cur.purchase += d.purchaseAmount ?? 0
      cur.billing += d.billingAmount ?? 0
    }
    storePerf.set(key, cur)
  }
  const storeSales = [...storePerf.entries()]
    .map(([id, v]) => ({
      store: id === '__none__' ? '店舗未設定' : (storeMap.get(id)?.name ?? '不明'),
      deals: v.deals,
      won: v.won,
      contractRate: v.deals > 0 ? v.won / v.deals : 0,
      purchase: v.purchase,
      billing: v.billing,
      avg: v.won > 0 ? Math.round(v.purchase / v.won) : 0,
    }))
    .sort((a, b) => b.purchase - a.purchase)

  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      purchaseAmount: { value: sumPurchase, compareValue: prevSumPurchase },
      billingAmount: { value: sumBilling, compareValue: prevSumBilling },
      avgDealAmount: { value: avgDealAmount, compareValue: prevAvg },
      estimateConversion: { value: estimateConversion, compareValue: null },
      upliftRate: { value: upliftRate, compareValue: null },
      itemCount: { value: purchaseItems.reduce((s, i) => s + i.quantity, 0), compareValue: null },
    },
    series: { amounts, categoryAmounts, deliveryMonthly: deliveryMonthly as unknown as SeriesPoint[] },
    breakdowns: { itemCategories, histogram, deliveryFunnel },
    tables: {
      topDeals: topDeals.map(d => ({
        customer: d.user.name,
        store: d.store?.name ?? '—',
        category: DEAL_CATEGORY_LABEL[d.category] ?? d.category,
        occurredAt: d.occurredAt.toISOString(),
        purchase: d.purchaseAmount ?? 0,
        billing: d.billingAmount ?? 0,
        dealId: d.id,
      })),
      storeSales,
    },
  }
  return NextResponse.json(response)
}
