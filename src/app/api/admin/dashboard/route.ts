import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, subDays, startOfDay, format } from 'date-fns'
import { jstMonthKey, jstDateKey } from '@/lib/datetime'

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

  // === 1. サマリー（すべてDB集計） ===
  const [
    totalCustomers,
    currentMonthCustomers,
    totalVisitsCount,
    currentMonthVisits,
    totalPurchaseAgg,
    currentMonthPurchaseAgg,
  ] = await Promise.all([
    prisma.user.count({ where: userWhere }),
    prisma.user.count({ where: { ...userWhere, createdAt: { gte: currentMonthStart } } }),
    prisma.visitSchedule.count({ where: visitUserWhere }),
    prisma.visitSchedule.count({ where: { visitDate: { gte: currentMonthStart }, ...visitUserWhere } }),
    prisma.visitSchedule.aggregate({
      where: { status: 'completed', ...visitUserWhere },
      _sum: { purchaseAmount: true },
    }),
    prisma.visitSchedule.aggregate({
      where: { status: 'completed', visitDate: { gte: currentMonthStart }, ...visitUserWhere },
      _sum: { purchaseAmount: true },
    }),
  ])

  const totalPurchaseAmount = totalPurchaseAgg._sum.purchaseAmount ?? 0
  const currentMonthPurchaseAmount = currentMonthPurchaseAgg._sum.purchaseAmount ?? 0

  // === 2. 店舗別当月顧客数 TOP10（groupBy） ===
  const storeCustomerGroups = await prisma.user.groupBy({
    by: ['storeId'],
    where: { ...userWhere, createdAt: { gte: currentMonthStart }, storeId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  // store名を取得するために storeId のリストから一括取得
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

  // === 3. 月次新規顧客数 (直近12ヶ月) ===
  // createdAtだけ取得（日付のみ、最小限のデータ）
  const newUsersInRange = await prisma.user.findMany({
    where: { ...userWhere, createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  })

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

  // === 4 & 5. 月次訪問数 (直近12ヶ月) & 日次訪問数 (直近30日) ===
  // visitDateだけ取得（最小限のデータ）
  const visitsInRange = await prisma.visitSchedule.findMany({
    where: { visitDate: { gte: twelveMonthsAgo }, ...visitUserWhere },
    select: { visitDate: true },
  })

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

  // === 6. 月次買取金額推移 (直近12ヶ月) ===
  // visitDate + purchaseAmount だけ取得（store情報不要）
  const completedVisitsRecent = await prisma.visitSchedule.findMany({
    where: {
      status: 'completed',
      visitDate: { gte: twelveMonthsAgo },
      ...visitUserWhere,
    },
    select: { visitDate: true, purchaseAmount: true },
  })

  const monthlyAmountMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyAmountMap[jstMonthKey(subMonths(now, i))] = 0
  for (const v of completedVisitsRecent) {
    const m = jstMonthKey(v.visitDate)
    if (m in monthlyAmountMap) monthlyAmountMap[m] += v.purchaseAmount ?? 0
  }
  const monthlyPurchaseAmount = Object.entries(monthlyAmountMap).map(([month, amount]) => ({
    month: month.slice(5) + '月',
    amount,
  }))

  // === 7. 店舗別買取金額ランキング (全期間 TOP10, groupBy + _sum) ===
  const storePurchaseGroups = await prisma.visitSchedule.groupBy({
    by: ['storeId'],
    where: { status: 'completed', ...visitUserWhere },
    _sum: { purchaseAmount: true },
    orderBy: { _sum: { purchaseAmount: 'desc' } },
    take: 10,
  })

  const rankingStoreIds = storePurchaseGroups.map(g => g.storeId)
  const rankingStores = rankingStoreIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: rankingStoreIds } }, select: { id: true, name: true } })
    : []
  const rankingStoreNameMap = new Map(rankingStores.map(s => [s.id, s.name]))

  const storePurchaseRanking = storePurchaseGroups.map(g => ({
    storeId: g.storeId,
    name: rankingStoreNameMap.get(g.storeId) ?? '',
    amount: g._sum.purchaseAmount ?? 0,
  }))

  // LINE 関連の統計
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [
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
    prisma.lineChannel.count(),
    prisma.lineChannel.count({ where: { isActive: true } }),
    prisma.lineUser.count(),
    prisma.lineUser.count({ where: { userId: { not: null } } }),
    prisma.lineMessage.count({ where: { direction: 'inbound', readAt: null } }),
    prisma.lineMessage.count({ where: { direction: 'inbound', sentAt: { gte: sevenDaysAgo } } }),
    prisma.lineMessage.count({ where: { direction: 'outbound', sentAt: { gte: sevenDaysAgo } } }),
    prisma.lineMessage.count({ where: { direction: 'outbound', status: 'failed', sentAt: { gte: sevenDaysAgo } } }),
    // 過去7日の日別受信＋送信数
    prisma.lineMessage.findMany({
      where: { sentAt: { gte: sevenDaysAgo } },
      select: { direction: true, sentAt: true },
    }),
  ])

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

  // === 案件分析（全社） ===
  // 月次案件数（直近12ヶ月）
  const dealsForTrend = await prisma.deal.findMany({
    where: { createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  })
  const monthlyDealMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyDealMap[jstMonthKey(subMonths(now, i))] = 0
  for (const d of dealsForTrend) {
    const m = format(d.createdAt, 'yyyy-MM')
    if (m in monthlyDealMap) monthlyDealMap[m]++
  }
  const monthlyDeals = Object.entries(monthlyDealMap).map(([month, count]) => ({ month: month.slice(5) + '月', count }))

  // ステータス内訳＋成約率（全期間）
  const dealStatusAgg = await prisma.deal.groupBy({ by: ['status'], _count: { _all: true } })
  const dealStatusBreakdown = dealStatusAgg.map(g => ({ status: g.status, count: g._count._all }))
  const totalDeals = dealStatusBreakdown.reduce((s, g) => s + g.count, 0)
  const wonDeals = dealStatusBreakdown
    .filter(g => g.status === 'contract' || g.status === 'completed')
    .reduce((s, g) => s + g.count, 0)
  const contractRate = totalDeals > 0 ? wonDeals / totalDeals : 0

  // 流入経路の内訳（全顧客）
  const leadAgg = await prisma.user.groupBy({ by: ['leadSource'], _count: { _all: true } })
  const leadSourceBreakdown = leadAgg
    .map(g => ({ name: g.leadSource ?? '未設定', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // リピート率（完了訪問2回以上の顧客 / 1回以上の顧客）
  const completedByUser = await prisma.visitSchedule.groupBy({
    by: ['userId'],
    where: { status: 'completed' },
    _count: { _all: true },
  })
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
