import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries } from '@/lib/analytics/period'
import { DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveAnalyticsParams, dealWhere, customerWhere, visitWhere, dateWhere,
  buildMeta, fetchStoreMap, WON_STATUSES,
} from '../_lib/params'

export const dynamic = 'force-dynamic'

// 概要タブ: 主要KPI・時系列・構成・店舗ランキング
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, granularity, filters } = params

  const inquiryWhere = (r: typeof range) => ({
    createdAt: dateWhere(r),
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
  })
  const deliveryWhere = (r: typeof range) => ({
    createdAt: dateWhere(r),
    status: { in: ['appraised', 'transferred'] },
  })

  const [
    deals, users, completedVisits, inquiryCount, deliveryAgg, storeMap,
    prevDeals, prevUserCount, prevVisitCount, prevInquiryCount, prevDeliveryAgg,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: dealWhere(range, filters),
      select: { occurredAt: true, purchaseAmount: true, billingAmount: true, status: true, category: true, storeId: true },
    }),
    prisma.user.findMany({ where: customerWhere(range, filters), select: { createdAt: true } }),
    prisma.visitSchedule.findMany({
      where: visitWhere(range, filters, 'completed'),
      select: { purchaseAmount: true },
    }),
    prisma.inquiry.count({ where: inquiryWhere(range) }),
    prisma.deliveryShipment.aggregate({ where: deliveryWhere(range), _sum: { purchaseAmount: true }, _count: { _all: true } }),
    fetchStoreMap(),
    compare
      ? prisma.deal.findMany({
          where: dealWhere(compare, filters),
          select: { occurredAt: true, purchaseAmount: true, billingAmount: true, status: true },
        })
      : Promise.resolve(null),
    compare ? prisma.user.count({ where: customerWhere(compare, filters) }) : Promise.resolve(null),
    compare ? prisma.visitSchedule.count({ where: visitWhere(compare, filters, 'completed') }) : Promise.resolve(null),
    compare ? prisma.inquiry.count({ where: inquiryWhere(compare) }) : Promise.resolve(null),
    compare ? prisma.deliveryShipment.aggregate({ where: deliveryWhere(compare), _sum: { purchaseAmount: true } }) : Promise.resolve(null),
  ])

  const isWon = (s: string) => WON_STATUSES.includes(s)
  const wonDeals = deals.filter(d => isWon(d.status))
  const sumPurchase = wonDeals.reduce((s, d) => s + (d.purchaseAmount ?? 0), 0)
  const sumBilling = wonDeals.reduce((s, d) => s + (d.billingAmount ?? 0), 0)
  const contractRate = deals.length > 0 ? wonDeals.length / deals.length : 0

  const prevWon = (prevDeals ?? []).filter(d => isWon(d.status))
  const prevSumPurchase = prevDeals ? prevWon.reduce((s, d) => s + (d.purchaseAmount ?? 0), 0) : null
  const prevSumBilling = prevDeals ? prevWon.reduce((s, d) => s + (d.billingAmount ?? 0), 0) : null
  const prevContractRate = prevDeals ? (prevDeals.length > 0 ? prevWon.length / prevDeals.length : 0) : null

  // 時系列（比較期間はバケットindexで整列してオーバーレイ）
  const buckets = buildBuckets(range, granularity)
  const purchaseSeries = fillSeries(buckets, wonDeals, granularity, d => d.occurredAt, d => d.purchaseAmount ?? 0)
  const billingSeries = fillSeries(buckets, wonDeals, granularity, d => d.occurredAt, d => d.billingAmount ?? 0)
  const dealCountSeries = fillSeries(buckets, deals, granularity, d => d.occurredAt)
  const customerSeries = fillSeries(buckets, users, granularity, u => u.createdAt)

  let prevPurchaseSeries: number[] | null = null
  let prevDealCountSeries: number[] | null = null
  if (compare && prevDeals) {
    const prevBuckets = buildBuckets(compare, granularity)
    prevPurchaseSeries = fillSeries(prevBuckets, prevWon, granularity, d => d.occurredAt, d => d.purchaseAmount ?? 0)
    prevDealCountSeries = fillSeries(prevBuckets, prevDeals, granularity, d => d.occurredAt)
  }

  const amounts: SeriesPoint[] = buckets.map((b, i) => ({
    label: b.label,
    purchase: purchaseSeries[i],
    billing: billingSeries[i],
    ...(prevPurchaseSeries ? { prevPurchase: prevPurchaseSeries[i] ?? 0 } : {}),
  }))
  const counts: SeriesPoint[] = buckets.map((b, i) => ({
    label: b.label,
    deals: dealCountSeries[i],
    customers: customerSeries[i],
    ...(prevDealCountSeries ? { prevDeals: prevDealCountSeries[i] ?? 0 } : {}),
  }))

  // 案件カテゴリー構成
  const categoryAgg = new Map<string, { count: number; amount: number }>()
  for (const d of deals) {
    const cur = categoryAgg.get(d.category) ?? { count: 0, amount: 0 }
    cur.count++
    if (isWon(d.status)) cur.amount += d.purchaseAmount ?? 0
    categoryAgg.set(d.category, cur)
  }
  const dealCategory = [...categoryAgg.entries()]
    .map(([key, v]) => ({ name: DEAL_CATEGORY_LABEL[key] ?? key, count: v.count, amount: v.amount }))
    .sort((a, b) => b.count - a.count)

  // チャネル別買取金額（訪問 vs 宅配）
  const visitAmount = completedVisits.reduce((s, v) => s + (v.purchaseAmount ?? 0), 0)
  const deliveryAmount = deliveryAgg._sum.purchaseAmount ?? 0
  const channel = [
    { name: '訪問買取', amount: visitAmount },
    { name: '宅配買取', amount: deliveryAmount },
  ]

  // 店舗別買取金額 TOP10
  const storeAgg = new Map<string, number>()
  for (const d of wonDeals) {
    if (!d.storeId) continue
    storeAgg.set(d.storeId, (storeAgg.get(d.storeId) ?? 0) + (d.purchaseAmount ?? 0))
  }
  const storeTop = [...storeAgg.entries()]
    .map(([id, amount]) => ({ name: storeMap.get(id)?.name ?? '不明', amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      purchaseAmount: { value: sumPurchase, compareValue: prevSumPurchase },
      billingAmount: { value: sumBilling, compareValue: prevSumBilling },
      dealCount: { value: deals.length, compareValue: prevDeals ? prevDeals.length : null },
      contractRate: { value: contractRate, compareValue: prevContractRate },
      newCustomers: { value: users.length, compareValue: prevUserCount },
      completedVisits: { value: completedVisits.length, compareValue: prevVisitCount },
      inquiries: { value: inquiryCount, compareValue: prevInquiryCount },
      deliveryAmount: { value: deliveryAmount, compareValue: prevDeliveryAgg ? (prevDeliveryAgg._sum.purchaseAmount ?? 0) : null },
    },
    series: { amounts, counts },
    breakdowns: { dealCategory, channel, storeTop },
    tables: {},
  }
  return NextResponse.json(response)
}
