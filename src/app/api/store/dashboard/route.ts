import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, startOfDay, format } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))
  const today = startOfDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // ── 自店舗の訪問データ（直近12ヶ月） ──
  const myVisits = await prisma.visitSchedule.findMany({
    where: { storeId, visitDate: { gte: twelveMonthsAgo } },
    select: { visitDate: true, purchaseAmount: true, status: true },
  })

  // ── 自店舗の当月買取金額 ──
  const currentMonthAmount = myVisits
    .filter(v => v.status === 'completed' && v.visitDate >= currentMonthStart)
    .reduce((s, v) => s + (v.purchaseAmount ?? 0), 0)

  // ── 全店舗の買取金額ランキング（当月 TOP10） ──
  // groupBy + _sum でDB側集計し、全行フェッチを回避
  const storeAmountAgg = await prisma.visitSchedule.groupBy({
    by: ['storeId'],
    where: {
      status: 'completed',
      visitDate: { gte: currentMonthStart },
    },
    _sum: { purchaseAmount: true },
    orderBy: { _sum: { purchaseAmount: 'desc' } },
  })

  // storeId → 店舗名の解決（ランキングに載る店舗のみ取得）
  const rankedStoreIds = storeAmountAgg.map(a => a.storeId)
  const storeNames = rankedStoreIds.length > 0
    ? await prisma.store.findMany({
        where: { id: { in: rankedStoreIds } },
        select: { id: true, name: true },
      })
    : []
  const storeNameMap = new Map(storeNames.map(s => [s.id, s.name]))

  const ranking = storeAmountAgg.map(a => ({
    storeId: a.storeId,
    name: storeNameMap.get(a.storeId) ?? '',
    amount: a._sum.purchaseAmount ?? 0,
  }))

  // 自店舗の順位
  const myRankIndex = ranking.findIndex(r => r.storeId === storeId)
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null
  const totalStores = await prisma.store.count({ where: { isActive: true } })

  // TOP10（金額は非表示のため amount を返さない）
  const top10 = ranking.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    name: r.storeId === storeId ? r.name : r.name,
    isMe: r.storeId === storeId,
    // 相対バー表示用（最大値比）
    ratio: ranking.length > 0 ? r.amount / ranking[0].amount : 0,
  }))

  // ── 月次買取金額の推移（自店舗・直近12ヶ月） ──
  const monthlyAmountMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyAmountMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const v of myVisits) {
    if (v.status !== 'completed') continue
    const m = format(v.visitDate, 'yyyy-MM')
    if (m in monthlyAmountMap) monthlyAmountMap[m] += v.purchaseAmount ?? 0
  }
  const monthlyPurchaseAmount = Object.entries(monthlyAmountMap).map(([month, amount]) => ({
    month: month.slice(5) + '月',
    amount,
  }))

  // ── 月次訪問件数の推移（自店舗・直近12ヶ月） ──
  const monthlyVisitMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyVisitMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const v of myVisits) {
    const m = format(v.visitDate, 'yyyy-MM')
    if (m in monthlyVisitMap) monthlyVisitMap[m]++
  }
  const monthlyVisits = Object.entries(monthlyVisitMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))

  // ── 本日の案件一覧 ──
  const todaySchedules = await prisma.visitSchedule.findMany({
    where: {
      storeId,
      visitDate: { gte: today, lt: tomorrow },
    },
    include: {
      user: { select: { id: true, name: true, address: true, phone: true } },
    },
    orderBy: { visitDate: 'asc' },
  })

  const todayCases = todaySchedules.map(s => ({
    id: s.id,
    customerName: s.user.name,
    address: s.user.address,
    phone: s.user.phone,
    status: s.status,
    note: s.note,
    purchaseAmount: s.purchaseAmount,
  }))

  // ── 当月訪問件数 / 当月完了件数 ──
  const currentMonthVisitCount = myVisits.filter(v => v.visitDate >= currentMonthStart).length
  const currentMonthCompletedCount = myVisits.filter(v => v.visitDate >= currentMonthStart && v.status === 'completed').length

  // ── 前月比（買取金額・訪問件数） ──
  const prevMonthStart = startOfMonth(subMonths(now, 1))
  const prevMonthAmount = myVisits
    .filter(v => v.status === 'completed' && v.visitDate >= prevMonthStart && v.visitDate < currentMonthStart)
    .reduce((s, v) => s + (v.purchaseAmount ?? 0), 0)
  const prevMonthVisitCount = myVisits.filter(v => v.visitDate >= prevMonthStart && v.visitDate < currentMonthStart).length

  // ── 自店舗の案件（直近12ヶ月：推移用） ──
  const myDeals = await prisma.deal.findMany({
    where: { storeId, createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  })
  const monthlyDealMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyDealMap[format(subMonths(now, i), 'yyyy-MM')] = 0
  for (const d of myDeals) {
    const m = format(d.createdAt, 'yyyy-MM')
    if (m in monthlyDealMap) monthlyDealMap[m]++
  }
  const monthlyDeals = Object.entries(monthlyDealMap).map(([month, count]) => ({ month: month.slice(5) + '月', count }))
  const currentMonthDealCount = myDeals.filter(d => d.createdAt >= currentMonthStart).length
  const prevMonthDealCount = myDeals.filter(d => d.createdAt >= prevMonthStart && d.createdAt < currentMonthStart).length

  // ── 案件ステータスの内訳＋契約率（自店舗・全期間） ──
  const dealStatusAgg = await prisma.deal.groupBy({
    by: ['status'],
    where: { storeId },
    _count: { _all: true },
  })
  const dealStatusBreakdown = dealStatusAgg.map(g => ({ status: g.status, count: g._count._all }))
  const totalDeals = dealStatusBreakdown.reduce((s, g) => s + g.count, 0)
  const wonDeals = dealStatusBreakdown
    .filter(g => g.status === 'contract' || g.status === 'completed')
    .reduce((s, g) => s + g.count, 0)
  const contractRate = totalDeals > 0 ? wonDeals / totalDeals : 0

  // ── 流入経路の内訳（自店舗の顧客） ──
  const leadAgg = await prisma.user.groupBy({
    by: ['leadSource'],
    where: { storeId },
    _count: { _all: true },
  })
  const leadSourceBreakdown = leadAgg
    .map(g => ({ name: g.leadSource ?? '未設定', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // ── リピート率（完了訪問が2回以上の顧客 / 完了訪問が1回以上の顧客） ──
  const completedByUser = await prisma.visitSchedule.groupBy({
    by: ['userId'],
    where: { storeId, status: 'completed' },
    _count: { _all: true },
  })
  const customersWithPurchase = completedByUser.length
  const repeatCustomers = completedByUser.filter(g => g._count._all >= 2).length
  const repeatRate = customersWithPurchase > 0 ? repeatCustomers / customersWithPurchase : 0

  return NextResponse.json({
    myRank,
    totalStores,
    top10,
    currentMonthAmount,
    currentMonthVisitCount,
    currentMonthCompletedCount,
    monthlyPurchaseAmount,
    monthlyVisits,
    todayCases,
    // 追加指標
    prevMonthAmount,
    prevMonthVisitCount,
    monthlyDeals,
    currentMonthDealCount,
    prevMonthDealCount,
    dealStatusBreakdown,
    totalDeals,
    contractRate,
    leadSourceBreakdown,
    repeatRate,
    repeatCustomers,
    customersWithPurchase,
  })
}
