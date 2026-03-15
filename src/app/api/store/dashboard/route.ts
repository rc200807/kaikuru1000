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
    where: { storeId, visitDate: { gte: twelveMonthsAgo }, user: { isTestData: false } },
    select: { visitDate: true, purchaseAmount: true, status: true },
  })

  // ── 自店舗の当月買取金額 ──
  const currentMonthAmount = myVisits
    .filter(v => v.status === 'completed' && v.visitDate >= currentMonthStart)
    .reduce((s, v) => s + (v.purchaseAmount ?? 0), 0)

  // ── 全店舗の買取金額ランキング（当月 TOP10） ──
  const allStoresCurrentMonth = await prisma.visitSchedule.findMany({
    where: {
      status: 'completed',
      visitDate: { gte: currentMonthStart },
      user: { isTestData: false },
    },
    select: { storeId: true, purchaseAmount: true, store: { select: { name: true } } },
  })

  const storeAmountMap: Record<string, { name: string; amount: number }> = {}
  for (const v of allStoresCurrentMonth) {
    if (!v.storeId) continue
    if (!storeAmountMap[v.storeId]) storeAmountMap[v.storeId] = { name: v.store.name, amount: 0 }
    storeAmountMap[v.storeId].amount += v.purchaseAmount ?? 0
  }
  const ranking = Object.entries(storeAmountMap)
    .map(([id, d]) => ({ storeId: id, name: d.name, amount: d.amount }))
    .sort((a, b) => b.amount - a.amount)

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
      user: { isTestData: false },
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
  })
}
