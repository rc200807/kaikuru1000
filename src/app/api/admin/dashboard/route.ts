import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, subDays, startOfDay, format } from 'date-fns'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))
  const thirtyDaysAgo = startOfDay(subDays(now, 29))

  // --- 全顧客 ---
  const allUsers = await prisma.user.findMany({
    select: { storeId: true, createdAt: true, store: { select: { name: true } } },
  })

  // --- 全訪問スケジュール (直近12ヶ月) ---
  const allVisits = await prisma.visitSchedule.findMany({
    where: { visitDate: { gte: twelveMonthsAgo } },
    select: { visitDate: true },
  })

  // --- 買取実績 (completed, 直近12ヶ月 - 推移グラフ用) ---
  const completedVisitsRecent = await prisma.visitSchedule.findMany({
    where: {
      status: 'completed',
      visitDate: { gte: twelveMonthsAgo },
    },
    select: {
      visitDate: true,
      purchaseAmount: true,
      storeId: true,
      store: { select: { name: true } },
    },
  })

  // --- 店舗別買取金額ランキング用 (全期間) ---
  const allCompletedVisits = await prisma.visitSchedule.findMany({
    where: { status: 'completed' },
    select: {
      purchaseAmount: true,
      storeId: true,
      store: { select: { name: true } },
      visitDate: true,
    },
  })

  // 1. サマリー
  const totalCustomers = allUsers.length
  const currentMonthCustomers = allUsers.filter(u => u.createdAt >= currentMonthStart).length
  const totalVisitsCount = await prisma.visitSchedule.count()
  const currentMonthVisits = await prisma.visitSchedule.count({
    where: { visitDate: { gte: currentMonthStart } },
  })

  // 総買取金額 / 当月買取金額
  const totalPurchaseAmount = allCompletedVisits.reduce((sum, v) => sum + (v.purchaseAmount ?? 0), 0)
  const currentMonthPurchaseAmount = allCompletedVisits
    .filter(v => v.visitDate >= currentMonthStart)
    .reduce((sum, v) => sum + (v.purchaseAmount ?? 0), 0)

  // 2. 店舗別当月顧客数 TOP10
  const storeMap: Record<string, { name: string; count: number }> = {}
  for (const u of allUsers) {
    if (!u.storeId || !u.store) continue
    if (u.createdAt < currentMonthStart) continue
    if (!storeMap[u.storeId]) storeMap[u.storeId] = { name: u.store.name, count: 0 }
    storeMap[u.storeId].count++
  }
  const storeRanking = Object.entries(storeMap)
    .map(([id, d]) => ({ storeId: id, name: d.name, count: d.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 3. 月次新規顧客数 (直近12ヶ月)
  const monthlyNewMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyNewMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const u of allUsers) {
    const m = format(u.createdAt, 'yyyy-MM')
    if (m in monthlyNewMap) monthlyNewMap[m]++
  }
  const monthlyNewCustomers = Object.entries(monthlyNewMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))

  // 4. 月次訪問数 (直近12ヶ月)
  const monthlyVisitMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyVisitMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const v of allVisits) {
    const m = format(v.visitDate, 'yyyy-MM')
    if (m in monthlyVisitMap) monthlyVisitMap[m]++
  }
  const monthlyVisits = Object.entries(monthlyVisitMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))

  // 5. 日次訪問数 (直近30日)
  const dailyMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) dailyMap[format(subDays(now, i), 'yyyy-MM-dd')] = 0
  for (const v of allVisits) {
    const d = format(v.visitDate, 'yyyy-MM-dd')
    if (d in dailyMap) dailyMap[d]++
  }
  const dailyVisits = Object.entries(dailyMap).map(([date, count]) => ({
    date: format(new Date(date + 'T00:00:00'), 'M/d'),
    count,
  }))

  // 6. 月次買取金額推移 (直近12ヶ月)
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

  // 7. 店舗別買取金額ランキング (全期間 TOP10)
  const storePurchaseMap: Record<string, { name: string; amount: number }> = {}
  for (const v of allCompletedVisits) {
    if (!v.storeId || !v.store) continue
    if (!storePurchaseMap[v.storeId]) storePurchaseMap[v.storeId] = { name: v.store.name, amount: 0 }
    storePurchaseMap[v.storeId].amount += v.purchaseAmount ?? 0
  }
  const storePurchaseRanking = Object.entries(storePurchaseMap)
    .map(([id, d]) => ({ storeId: id, name: d.name, amount: d.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

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
