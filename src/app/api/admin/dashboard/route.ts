import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, subDays, startOfDay, format } from 'date-fns'
import { jstMonthKey, jstDateKey } from '@/lib/datetime'
import {
  monthlyPurchaseAmount as monthlyPurchaseAmountByMonth,
  purchasedDealWhere,
  recentMonthKeys,
  sumPurchaseAmount,
} from '@/lib/purchase-aggregation'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin','superadmin','hr'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))
  const thirtyDaysAgo = startOfDay(subDays(now, 29))

  const userWhere = {}
  const visitUserWhere = {}

  // LINE 統計で使う起点（下の Promise.all で参照する）
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // === 集計クエリはすべて独立しているので1回の Promise.all でまとめて投げる ===
  // （以前は9本ほどを直列に await しており、関数→DBの往復がそのまま積み上がっていた）
  const [
    totalCustomers,
    currentMonthCustomers,
    totalVisitsCount,
    currentMonthVisits,
    storeCustomerGroups,
    newUsersInRange,
    visitsInRange,
    storePurchaseGroups,
    dealsForTrend,
    dealStatusAgg,
    leadAgg,
    completedByUser,
    lineChannelTotal,
    lineChannelActive,
    lineUserTotal,
    lineUserLinked,
    lineUnreadCount,
    lineInbound7d,
    lineOutbound7d,
    lineSendFailures7d,
    lineMessages7d,
  ] = await Promise.all([
    prisma.user.count({ where: userWhere }),
    prisma.user.count({ where: { ...userWhere, createdAt: { gte: currentMonthStart } } }),
    prisma.visitSchedule.count({ where: visitUserWhere }),
    prisma.visitSchedule.count({ where: { visitDate: { gte: currentMonthStart }, ...visitUserWhere } }),
    // 店舗別当月顧客数 TOP10
    prisma.user.groupBy({
      by: ['storeId'],
      where: { ...userWhere, createdAt: { gte: currentMonthStart }, storeId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    // 月次新規顧客数（直近12ヶ月）: createdAt だけ
    prisma.user.findMany({
      where: { ...userWhere, createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true },
    }),
    // 月次・日次訪問数: visitDate だけ
    prisma.visitSchedule.findMany({
      where: { visitDate: { gte: twelveMonthsAgo }, ...visitUserWhere },
      select: { visitDate: true },
    }),
    // 店舗別買取金額ランキング（全期間 TOP10）。買取金額の正は案件（Deal）
    prisma.deal.groupBy({
      by: ['storeId'],
      where: purchasedDealWhere({ storeId: { not: null } }),
      _sum: { purchaseAmount: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
      take: 10,
    }),
    // 月次案件数（直近12ヶ月）
    prisma.deal.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['leadSource'], _count: { _all: true } }),
    // リピート率の母数（買取実績のある顧客ごとの案件数）
    prisma.deal.groupBy({
      by: ['userId'],
      where: purchasedDealWhere(),
      _count: { _all: true },
    }),
    // LINE 関連
    prisma.lineChannel.count(),
    prisma.lineChannel.count({ where: { isActive: true } }),
    prisma.lineUser.count(),
    prisma.lineUser.count({ where: { userId: { not: null } } }),
    prisma.lineMessage.count({ where: { direction: 'inbound', readAt: null } }),
    prisma.lineMessage.count({ where: { direction: 'inbound', sentAt: { gte: sevenDaysAgo } } }),
    prisma.lineMessage.count({ where: { direction: 'outbound', sentAt: { gte: sevenDaysAgo } } }),
    prisma.lineMessage.count({ where: { direction: 'outbound', status: 'failed', sentAt: { gte: sevenDaysAgo } } }),
    prisma.lineMessage.findMany({
      where: { sentAt: { gte: sevenDaysAgo } },
      select: { direction: true, sentAt: true },
    }),
  ])

  // 買取金額は案件（Deal.purchaseAmount）＋宅配買取（DeliveryShipment）から集計する。
  // 旧 VisitSchedule.purchaseAmount は案件詳細で品目を登録した取引では入らないため 0 になっていた。
  const monthKeys = recentMonthKeys(12, now)
  const [totalTotals, currentMonthTotals, monthlyAmountMap] = await Promise.all([
    sumPurchaseAmount(),
    sumPurchaseAmount({ occurredAt: { gte: currentMonthStart } }, { shipmentMonth: jstMonthKey(now) }),
    monthlyPurchaseAmountByMonth(monthKeys),
  ])
  const totalPurchaseAmount = totalTotals.amount
  const currentMonthPurchaseAmount = currentMonthTotals.amount

  // === 店舗別当月顧客数 TOP10: store名は結果に依存するのでここで解決 ===
  const storeIds = storeCustomerGroups.map(g => g.storeId).filter((id): id is string => id !== null)
  const stores = storeIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const storeNameMap = new Map(stores.map(s => [s.id, s.name]))

  const storeRanking = storeCustomerGroups.map(g => ({
    storeId: g.storeId!,
    name: storeNameMap.get(g.storeId!) ?? '',
    count: g._count.id,
  }))

  const monthlyNewMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyNewMap[jstMonthKey(subMonths(now, i))] = 0
  for (const u of newUsersInRange) {
    const m = jstMonthKey(u.createdAt)
    if (m in monthlyNewMap) monthlyNewMap[m]++
  }
  const monthlyNewCustomers = Object.entries(monthlyNewMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))

  const monthlyVisitMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyVisitMap[jstMonthKey(subMonths(now, i))] = 0
  const dailyMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) dailyMap[jstDateKey(subDays(now, i))] = 0

  for (const v of visitsInRange) {
    const m = jstMonthKey(v.visitDate)
    if (m in monthlyVisitMap) monthlyVisitMap[m]++
    const d = jstDateKey(v.visitDate)
    if (d in dailyMap) dailyMap[d]++
  }

  const monthlyVisits = Object.entries(monthlyVisitMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))
  const dailyVisits = Object.entries(dailyMap).map(([date, count]) => ({
    date: format(new Date(date + 'T00:00:00'), 'M/d'),
    count,
  }))

  const monthlyPurchaseAmount = monthKeys.map(month => ({
    month: month.slice(5) + '月',
    amount: monthlyAmountMap[month] ?? 0,
  }))

  const rankingStoreIds = storePurchaseGroups.map(g => g.storeId).filter((id): id is string => !!id)
  const rankingStores = rankingStoreIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: rankingStoreIds } }, select: { id: true, name: true } })
    : []
  const rankingStoreNameMap = new Map(rankingStores.map(s => [s.id, s.name]))

  const storePurchaseRanking = storePurchaseGroups
    .filter((g): g is typeof g & { storeId: string } => !!g.storeId)
    .map(g => ({
      storeId: g.storeId,
      name: rankingStoreNameMap.get(g.storeId) ?? '',
      amount: g._sum.purchaseAmount ?? 0,
    }))

  // 日別集計（直近7日）
  const lineDailyMap: Record<string, { date: string; inbound: number; outbound: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    lineDailyMap[key] = { date: key, inbound: 0, outbound: 0 }
  }
  for (const m of lineMessages7d) {
    const key = m.sentAt.toISOString().slice(0, 10)
    if (lineDailyMap[key]) {
      if (m.direction === 'inbound') lineDailyMap[key].inbound++
      else if (m.direction === 'outbound') lineDailyMap[key].outbound++
    }
  }
  const lineDaily = Object.values(lineDailyMap)

  // === 案件分析（全社）: 月次案件数（直近12ヶ月）===
  const monthlyDealMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyDealMap[jstMonthKey(subMonths(now, i))] = 0
  for (const d of dealsForTrend) {
    const m = format(d.createdAt, 'yyyy-MM')
    if (m in monthlyDealMap) monthlyDealMap[m]++
  }
  const monthlyDeals = Object.entries(monthlyDealMap).map(([month, count]) => ({ month: month.slice(5) + '月', count }))

  // ステータス内訳＋成約率（全期間）
  const dealStatusBreakdown = dealStatusAgg.map(g => ({ status: g.status, count: g._count._all }))
  const totalDeals = dealStatusBreakdown.reduce((s, g) => s + g.count, 0)
  const wonDeals = dealStatusBreakdown
    .filter(g => g.status === 'contract' || g.status === 'completed')
    .reduce((s, g) => s + g.count, 0)
  const contractRate = totalDeals > 0 ? wonDeals / totalDeals : 0

  // 流入経路の内訳（全顧客）
  const leadSourceBreakdown = leadAgg
    .map(g => ({ name: g.leadSource ?? '未設定', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // リピート率（買取実績2件以上の顧客 / 1件以上の顧客）
  const customersWithPurchase = completedByUser.length
  const repeatCustomers = completedByUser.filter(g => g._count._all >= 2).length
  const repeatRate = customersWithPurchase > 0 ? repeatCustomers / customersWithPurchase : 0

  return NextResponse.json({
    summary: {
      totalCustomers,
      currentMonthCustomers,
      totalVisitsCount,
      currentMonthVisits,
      totalPurchaseAmount,
      currentMonthPurchaseAmount,
    },
    storeRanking,
    monthlyNewCustomers,
    monthlyVisits,
    dailyVisits,
    monthlyPurchaseAmount,
    storePurchaseRanking,
    monthlyDeals,
    dealStatusBreakdown,
    totalDeals,
    contractRate,
    leadSourceBreakdown,
    repeatRate,
    repeatCustomers,
    customersWithPurchase,
    line: {
      channelTotal: lineChannelTotal,
      channelActive: lineChannelActive,
      userTotal: lineUserTotal,
      userLinked: lineUserLinked,
      unreadCount: lineUnreadCount,
      inbound7d: lineInbound7d,
      outbound7d: lineOutbound7d,
      sendFailures7d: lineSendFailures7d,
      daily: lineDaily,
    },
  })
}
