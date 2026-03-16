import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, subDays, startOfDay, format } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const includeTestData = searchParams.get('includeTestData') === 'true'

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))
  const thirtyDaysAgo = startOfDay(subDays(now, 29))

  // テストデータフィルター（includeTestData=trueなら全データ、falseならテスト除外）
  const userWhere = includeTestData ? {} : { isTestData: false as const }
  const visitUserWhere = includeTestData ? {} : { user: { isTestData: false as const } }

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
  for (let i = 11; i >= 0; i--) monthlyNewMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const u of newUsersInRange) {
    const m = format(u.createdAt, 'yyyy-MM')
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
  for (let i = 11; i >= 0; i--) monthlyVisitMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  const dailyMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) dailyMap[format(subDays(now, i), 'yyyy-MM-dd')] = 0

  for (const v of visitsInRange) {
    const m = format(v.visitDate, 'yyyy-MM')
    if (m in monthlyVisitMap) monthlyVisitMap[m]++
    const d = format(v.visitDate, 'yyyy-MM-dd')
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
  for (let i = 11; i >= 0; i--) monthlyAmountMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const v of completedVisitsRecent) {
    const m = format(v.visitDate, 'yyyy-MM')
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
  })
}
