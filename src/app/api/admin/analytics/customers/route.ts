import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries } from '@/lib/analytics/period'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveAnalyticsParams, customerWhere, visitWhere, dealWhere, buildMeta, fetchStoreMap, WON_STATUSES,
} from '../_lib/params'

export const dynamic = 'force-dynamic'

// 顧客タブ: 新規推移・属性構成・リピート・優良顧客
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, granularity, filters } = params

  const [
    users, completedByUser, lineUserTotal, lineUserLinked, topCustomerAgg, storeMap,
    prevUserCount, prevCompletedByUser,
  ] = await Promise.all([
    prisma.user.findMany({
      where: customerWhere(range, filters),
      select: { createdAt: true, customerType: true, leadSource: true, storeId: true, visitFrequencyMonths: true },
    }),
    prisma.visitSchedule.groupBy({
      by: ['userId'],
      where: visitWhere(range, filters, 'completed'),
      _count: { _all: true },
    }),
    prisma.lineUser.count(),
    prisma.lineUser.count({ where: { userId: { not: null } } }),
    prisma.deal.groupBy({
      by: ['userId'],
      where: { ...dealWhere(range, filters), status: { in: WON_STATUSES } },
      _sum: { purchaseAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
      take: 20,
    }),
    fetchStoreMap(),
    compare ? prisma.user.count({ where: customerWhere(compare, filters) }) : Promise.resolve(null),
    compare
      ? prisma.visitSchedule.groupBy({
          by: ['userId'],
          where: visitWhere(compare, filters, 'completed'),
          _count: { _all: true },
        })
      : Promise.resolve(null),
  ])

  // 新規顧客の時系列 + 期間内累計
  const buckets = buildBuckets(range, granularity)
  const newSeries = fillSeries(buckets, users, granularity, u => u.createdAt)
  let cumulative = 0
  const newCustomers: SeriesPoint[] = buckets.map((b, i) => {
    cumulative += newSeries[i]
    return { label: b.label, count: newSeries[i], cumulative }
  })

  // 顧客種別構成
  const typeAgg = new Map<string, number>()
  for (const u of users) typeAgg.set(u.customerType, (typeAgg.get(u.customerType) ?? 0) + 1)
  const customerTypes = [...typeAgg.entries()]
    .map(([key, count]) => ({ name: CUSTOMER_TYPE_LABEL[key as keyof typeof CUSTOMER_TYPE_LABEL] ?? key, count }))
    .sort((a, b) => b.count - a.count)

  // 流入経路別新規顧客
  const leadAgg = new Map<string, number>()
  for (const u of users) {
    const name = u.leadSource ?? '未設定'
    leadAgg.set(name, (leadAgg.get(name) ?? 0) + 1)
  }
  const leadSources = [...leadAgg.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  // 都道府県別（担当店舗の都道府県で集計）
  const prefAgg = new Map<string, number>()
  for (const u of users) {
    const pref = (u.storeId ? storeMap.get(u.storeId)?.prefecture : null) ?? '店舗未設定'
    prefAgg.set(pref, (prefAgg.get(pref) ?? 0) + 1)
  }
  const prefectures = [...prefAgg.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 15)

  // 訪問頻度分布
  const freqAgg = new Map<number, number>()
  for (const u of users) freqAgg.set(u.visitFrequencyMonths, (freqAgg.get(u.visitFrequencyMonths) ?? 0) + 1)
  const visitFrequency = [...freqAgg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([months, count]) => ({ name: `${months}ヶ月毎`, count }))

  // リピート分析（期間内に完了訪問した顧客の訪問回数分布）
  const activeCustomers = completedByUser.length
  const repeatCustomers = completedByUser.filter(g => g._count._all >= 2).length
  const repeatRate = activeCustomers > 0 ? repeatCustomers / activeCustomers : 0
  const repeatBins = [
    { label: '1回', min: 1, max: 1 },
    { label: '2回', min: 2, max: 2 },
    { label: '3〜5回', min: 3, max: 5 },
    { label: '6回以上', min: 6, max: Infinity },
  ]
  const repeatDistribution = repeatBins.map(bin => ({
    name: bin.label,
    count: completedByUser.filter(g => g._count._all >= bin.min && g._count._all <= bin.max).length,
  }))

  const prevActive = prevCompletedByUser ? prevCompletedByUser.length : null
  const prevRepeatRate = prevCompletedByUser
    ? (prevCompletedByUser.length > 0
        ? prevCompletedByUser.filter(g => g._count._all >= 2).length / prevCompletedByUser.length
        : 0)
    : null

  // 期間内買取額 TOP 顧客
  const topUserIds = topCustomerAgg.map(g => g.userId)
  const topUsers = topUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, name: true, customerType: true, storeId: true, leadSource: true },
      })
    : []
  const topUserMap = new Map(topUsers.map(u => [u.id, u]))
  const topCustomers = topCustomerAgg.map(g => {
    const u = topUserMap.get(g.userId)
    return {
      customer: u?.name ?? '不明',
      customerType: u ? (CUSTOMER_TYPE_LABEL[u.customerType as keyof typeof CUSTOMER_TYPE_LABEL] ?? u.customerType) : '—',
      store: u?.storeId ? (storeMap.get(u.storeId)?.name ?? '—') : '—',
      leadSource: u?.leadSource ?? '未設定',
      deals: g._count._all,
      amount: g._sum.purchaseAmount ?? 0,
      userId: g.userId,
    }
  })

  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      newCustomers: { value: users.length, compareValue: prevUserCount },
      activeCustomers: { value: activeCustomers, compareValue: prevActive },
      repeatRate: { value: repeatRate, compareValue: prevRepeatRate },
      lineLinkRate: { value: lineUserTotal > 0 ? lineUserLinked / lineUserTotal : 0, compareValue: null },
    },
    series: { newCustomers },
    breakdowns: { customerTypes, leadSources, prefectures, visitFrequency, repeatDistribution },
    tables: { topCustomers },
  }
  return NextResponse.json(response)
}
