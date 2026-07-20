import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries } from '@/lib/analytics/period'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import { resolveAnalyticsParams, dateWhere, buildMeta, fetchStoreMap } from '../_lib/params'

export const dynamic = 'force-dynamic'

const INVENTORY_STATUS_LABEL: Record<string, string> = {
  draft: '下書き', ready: '出品準備完了', listed: '出品中', sold: '売却済み', archived: 'アーカイブ',
}

const MARGIN_BINS = [
  { label: '赤字', max: 0 },
  { label: '0〜20%', max: 0.2 },
  { label: '20〜40%', max: 0.4 },
  { label: '40〜60%', max: 0.6 },
  { label: '60〜80%', max: 0.8 },
  { label: '80%〜', max: Infinity },
]

// 商品・在庫タブ: 買取品目・在庫ライフサイクル・販売実績・粗利
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, granularity, filters } = params
  const storeFilter = filters.storeId ? { storeId: filters.storeId } : {}

  const [
    purchaseItems, categories, statusAgg, listedCount, soldItems, staleItems, topItems, storeMap,
    prevSoldItems, prevItemCount,
  ] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: {
        createdAt: dateWhere(range),
        ...(filters.storeId ? { deal: { storeId: filters.storeId } } : {}),
      },
      select: { purchasePrice: true, quantity: true, categoryId: true, category: true },
    }),
    prisma.purchaseCategory.findMany({ select: { id: true, name: true } }),
    prisma.inventoryItem.groupBy({ by: ['status'], where: { ...storeFilter }, _count: { _all: true } }),
    prisma.inventoryItem.count({ where: { ...storeFilter, listedAt: dateWhere(range) } }),
    prisma.inventoryItem.findMany({
      where: { ...storeFilter, status: 'sold', soldAt: dateWhere(range) },
      select: { soldAt: true, soldPrice: true, costPrice: true, listedAt: true, brand: true },
    }),
    prisma.inventoryItem.findMany({
      where: { ...storeFilter, status: 'listed' },
      orderBy: { listedAt: 'asc' },
      take: 20,
      select: { title: true, brand: true, listingPrice: true, costPrice: true, listedAt: true, storeId: true },
    }),
    prisma.purchaseItem.findMany({
      where: {
        createdAt: dateWhere(range),
        ...(filters.storeId ? { deal: { storeId: filters.storeId } } : {}),
      },
      orderBy: { purchasePrice: 'desc' },
      take: 20,
      select: { itemName: true, category: true, purchasePrice: true, quantity: true, createdAt: true },
    }),
    fetchStoreMap(),
    compare
      ? prisma.inventoryItem.findMany({
          where: { ...storeFilter, status: 'sold', soldAt: dateWhere(compare) },
          select: { soldPrice: true, costPrice: true },
        })
      : Promise.resolve(null),
    compare
      ? prisma.purchaseItem.aggregate({
          where: {
            createdAt: dateWhere(compare),
            ...(filters.storeId ? { deal: { storeId: filters.storeId } } : {}),
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
  ])

  // KPI
  const itemCount = purchaseItems.reduce((s, i) => s + i.quantity, 0)
  const soldCount = soldItems.length
  const soldAmount = soldItems.reduce((s, i) => s + (i.soldPrice ?? 0), 0)
  const grossProfit = soldItems.reduce((s, i) => s + ((i.soldPrice ?? 0) - i.costPrice), 0)
  const leadTimes = soldItems
    .filter(i => i.listedAt && i.soldAt)
    .map(i => (i.soldAt!.getTime() - i.listedAt!.getTime()) / 86_400_000)
    .filter(d => d >= 0)
  const avgSellDays = leadTimes.length > 0 ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length : 0

  const prevSoldAmount = prevSoldItems ? prevSoldItems.reduce((s, i) => s + (i.soldPrice ?? 0), 0) : null
  const prevGross = prevSoldItems ? prevSoldItems.reduce((s, i) => s + ((i.soldPrice ?? 0) - i.costPrice), 0) : null

  // 品目カテゴリー別 TOP15
  const categoryNameMap = new Map(categories.map(c => [c.id, c.name]))
  const catAgg = new Map<string, { count: number; amount: number }>()
  for (const item of purchaseItems) {
    const name = (item.categoryId ? categoryNameMap.get(item.categoryId) : null) ?? item.category ?? '未分類'
    const cur = catAgg.get(name) ?? { count: 0, amount: 0 }
    cur.count += item.quantity
    cur.amount += item.purchasePrice * item.quantity
    catAgg.set(name, cur)
  }
  const itemCategories = [...catAgg.entries()]
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)

  // 在庫ステータス構成（現在のスナップショット）
  const inventoryStatus = statusAgg
    .map(g => ({ name: INVENTORY_STATUS_LABEL[g.status] ?? g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // 売却額 vs 原価の時系列
  const buckets = buildBuckets(range, granularity)
  const soldSeries = fillSeries(buckets, soldItems, granularity, i => i.soldAt!, i => i.soldPrice ?? 0)
  const costSeries = fillSeries(buckets, soldItems, granularity, i => i.soldAt!, i => i.costPrice)
  const salesTrend: SeriesPoint[] = buckets.map((b, i) => ({
    label: b.label, sold: soldSeries[i], cost: costSeries[i],
  }))

  // 粗利率分布
  const marginHistogram = MARGIN_BINS.map(bin => ({ name: bin.label, count: 0 }))
  for (const item of soldItems) {
    const sold = item.soldPrice ?? 0
    if (sold <= 0) continue
    const margin = (sold - item.costPrice) / sold
    const idx = margin < 0 ? 0 : MARGIN_BINS.findIndex((bin, i) => i > 0 && margin < bin.max)
    marginHistogram[idx === -1 ? MARGIN_BINS.length - 1 : idx].count++
  }

  // ブランド別売却額 TOP10
  const brandAgg = new Map<string, { count: number; amount: number }>()
  for (const item of soldItems) {
    const name = item.brand || 'ブランド未設定'
    const cur = brandAgg.get(name) ?? { count: 0, amount: 0 }
    cur.count++
    cur.amount += item.soldPrice ?? 0
    brandAgg.set(name, cur)
  }
  const brands = [...brandAgg.entries()]
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const now = Date.now()
  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      itemCount: { value: itemCount, compareValue: prevItemCount ? (prevItemCount._sum.quantity ?? 0) : null },
      listedCount: { value: listedCount, compareValue: null },
      soldCount: { value: soldCount, compareValue: prevSoldItems ? prevSoldItems.length : null },
      soldAmount: { value: soldAmount, compareValue: prevSoldAmount },
      grossProfit: { value: grossProfit, compareValue: prevGross },
      avgSellDays: { value: avgSellDays, compareValue: null },
    },
    series: { salesTrend },
    breakdowns: { itemCategories, inventoryStatus, marginHistogram, brands },
    tables: {
      topItems: topItems.map(i => ({
        item: i.itemName,
        category: i.category,
        price: i.purchasePrice,
        quantity: i.quantity,
        createdAt: i.createdAt.toISOString(),
      })),
      staleItems: staleItems.map(i => ({
        item: i.title,
        brand: i.brand ?? '—',
        store: storeMap.get(i.storeId)?.name ?? '—',
        listingPrice: i.listingPrice ?? 0,
        costPrice: i.costPrice,
        daysListed: i.listedAt ? Math.floor((now - i.listedAt.getTime()) / 86_400_000) : null,
      })),
    },
  }
  return NextResponse.json(response)
}
