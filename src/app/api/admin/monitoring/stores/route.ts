import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'
import { startOfMonth, subMonths } from 'date-fns'
import { purchasedDealWhere } from '@/lib/purchase-aggregation'

// 全店舗パフォーマンス比較 + 休眠アラート
// 閾値はクエリで調整可能: ?loginDays=14&visitDays=30&pendingMax=5
export async function GET(request: NextRequest) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const loginDays = Math.max(1, parseInt(searchParams.get('loginDays') || '14', 10) || 14)
  const visitDays = Math.max(1, parseInt(searchParams.get('visitDays') || '30', 10) || 30)
  const pendingMax = Math.max(0, parseInt(searchParams.get('pendingMax') || '5', 10) || 5)

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const prevMonthStart = startOfMonth(subMonths(now, 1))

  const [
    stores,
    monthVisitsAgg, monthCompletedAgg,
    monthAmountAgg, prevMonthAmountAgg,
    monthDealsAgg, dealStatusAgg,
    lastVisitAgg, lastLoginAgg,
    memberCountAgg, customerCountAgg,
  ] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, prefecture: true, storeStatus: true },
      orderBy: { name: 'asc' },
    }),
    // 当月の訪問件数（全ステータス）
    prisma.visitSchedule.groupBy({
      by: ['storeId'],
      where: { visitDate: { gte: currentMonthStart } },
      _count: { _all: true },
    }),
    // 当月の完了訪問（件数）
    prisma.visitSchedule.groupBy({
      by: ['storeId'],
      where: { status: 'completed', visitDate: { gte: currentMonthStart } },
      _count: { _all: true },
    }),
    // 当月・前月の買取金額。買取金額の正は案件（Deal.purchaseAmount）で、
    // 訪問側の値は案件詳細から品目を登録した取引では入らない（以前は全店0円になっていた）
    prisma.deal.groupBy({
      by: ['storeId'],
      where: purchasedDealWhere({ storeId: { not: null }, occurredAt: { gte: currentMonthStart } }),
      _sum: { purchaseAmount: true },
    }),
    prisma.deal.groupBy({
      by: ['storeId'],
      where: purchasedDealWhere({ storeId: { not: null }, occurredAt: { gte: prevMonthStart, lt: currentMonthStart } }),
      _sum: { purchaseAmount: true },
    }),
    // 当月の新規案件数
    prisma.deal.groupBy({
      by: ['storeId'],
      where: { createdAt: { gte: currentMonthStart }, storeId: { not: null } },
      _count: { _all: true },
    }),
    // 案件ステータス内訳（全期間: 未対応数・契約率用）
    prisma.deal.groupBy({
      by: ['storeId', 'status'],
      where: { storeId: { not: null } },
      _count: { _all: true },
    }),
    // 最終訪問日（キャンセル以外・過去分）
    prisma.visitSchedule.groupBy({
      by: ['storeId'],
      where: { status: { not: 'cancelled' }, visitDate: { lt: now } },
      _max: { visitDate: true },
    }),
    // 最終ログイン（店舗アカウント・メンバー含む）
    prisma.accessLog.groupBy({
      by: ['userId'],
      where: { userType: 'store', action: 'login' },
      _max: { createdAt: true },
    }),
    prisma.storeMember.groupBy({ by: ['storeId'], _count: { _all: true } }),
    prisma.user.groupBy({
      by: ['storeId'],
      where: { mergedIntoUserId: null, isActive: true, storeId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const byStore = <T extends { storeId: string | null }>(rows: T[]) =>
    new Map(rows.filter(r => r.storeId).map(r => [r.storeId as string, r]))

  const monthVisits = byStore(monthVisitsAgg)
  const monthCompleted = byStore(monthCompletedAgg)
  const monthAmount = byStore(monthAmountAgg)
  const prevMonthAmountByStore = byStore(prevMonthAmountAgg)
  const monthDeals = byStore(monthDealsAgg)
  const lastVisit = byStore(lastVisitAgg)
  const memberCount = byStore(memberCountAgg)
  const customerCount = byStore(customerCountAgg)
  const lastLogin = new Map(lastLoginAgg.filter(r => r.userId).map(r => [r.userId as string, r._max.createdAt]))

  // 案件: 店舗ごとの未対応数・契約率
  const dealMap = new Map<string, { total: number; won: number; pending: number; visitDecided: number }>()
  for (const g of dealStatusAgg) {
    if (!g.storeId) continue
    let d = dealMap.get(g.storeId)
    if (!d) { d = { total: 0, won: 0, pending: 0, visitDecided: 0 }; dealMap.set(g.storeId, d) }
    d.total += g._count._all
    if (g.status === 'contract' || g.status === 'completed') d.won += g._count._all
    if (g.status === 'inquiry') d.pending += g._count._all
    if (g.status === 'visit_decided') d.visitDecided += g._count._all
  }

  const dayMs = 24 * 60 * 60 * 1000
  const result = stores.map(s => {
    const deals = dealMap.get(s.id)
    const lastVisitAt = lastVisit.get(s.id)?._max.visitDate ?? null
    const lastLoginAt = lastLogin.get(s.id) ?? null
    const storeMonthAmount = monthAmount.get(s.id)?._sum.purchaseAmount ?? 0
    const storePrevMonthAmount = prevMonthAmountByStore.get(s.id)?._sum.purchaseAmount ?? 0

    const daysSinceLogin = lastLoginAt ? Math.floor((now.getTime() - new Date(lastLoginAt).getTime()) / dayMs) : null
    const daysSinceVisit = lastVisitAt ? Math.floor((now.getTime() - new Date(lastVisitAt).getTime()) / dayMs) : null
    const pending = deals?.pending ?? 0

    const alerts: string[] = []
    if (daysSinceLogin === null) alerts.push('ログイン記録なし')
    else if (daysSinceLogin >= loginDays) alerts.push(`${daysSinceLogin}日間ログインなし`)
    if (daysSinceVisit === null) alerts.push('訪問実績なし')
    else if (daysSinceVisit >= visitDays) alerts.push(`${daysSinceVisit}日間訪問なし`)
    if (pending > pendingMax) alerts.push(`未対応案件 ${pending}件`)

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      prefecture: s.prefecture,
      customerCount: customerCount.get(s.id)?._count._all ?? 0,
      memberCount: memberCount.get(s.id)?._count._all ?? 0,
      monthAmount: storeMonthAmount,
      prevMonthAmount: storePrevMonthAmount,
      monthVisits: monthVisits.get(s.id)?._count._all ?? 0,
      monthCompleted: monthCompleted.get(s.id)?._count._all ?? 0,
      monthDeals: monthDeals.get(s.id)?._count._all ?? 0,
      pendingDeals: pending,
      contractRate: deals && deals.total > 0 ? deals.won / deals.total : null,
      lastVisitAt,
      lastLoginAt,
      alerts,
    }
  })

  return NextResponse.json({
    stores: result,
    thresholds: { loginDays, visitDays, pendingMax },
  })
}
