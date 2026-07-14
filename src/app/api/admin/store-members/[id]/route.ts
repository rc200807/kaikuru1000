import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'
import { startOfMonth, subMonths } from 'date-fns'
import { jstMonthKey } from '@/lib/datetime'
import {
  visitWhereForMember, dealWhereForMember, estimateWhereForMember, accessLogWhereForMember,
  type MemberRef,
} from '@/lib/member-attribution'

// 店舗メンバー詳細（プロフィール + 実績集計 + 月次推移 + 直近の担当訪問/案件）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const member = await prisma.storeMember.findUnique({
    where: { id },
    select: {
      id: true, storeId: true, name: true, email: true, avatar: true, createdAt: true,
      store: { select: { id: true, name: true, code: true, prefecture: true } },
    },
  })
  if (!member) return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })

  const m: MemberRef = { id: member.id, storeId: member.storeId, name: member.name }
  const visitWhere = visitWhereForMember(m)
  const dealWhere = dealWhereForMember(m)
  const logWhere = accessLogWhereForMember(m)

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))

  const [
    totalVisits, completedVisits, amountAgg, currentMonthAmountAgg,
    dealCount, estimateCount, contractCount, purchaseItemCount,
    loginCount, lastLogin,
    trendVisits, recentVisits, recentDeals,
    legacyVisitCount, legacyDealCount,
  ] = await Promise.all([
    prisma.visitSchedule.count({ where: visitWhere }),
    prisma.visitSchedule.count({ where: { AND: [visitWhere, { status: 'completed' }] } }),
    prisma.visitSchedule.aggregate({
      where: { AND: [visitWhere, { status: 'completed' }] },
      _sum: { purchaseAmount: true },
    }),
    prisma.visitSchedule.aggregate({
      where: { AND: [visitWhere, { status: 'completed', visitDate: { gte: currentMonthStart } }] },
      _sum: { purchaseAmount: true },
    }),
    prisma.deal.count({ where: dealWhere }),
    prisma.estimate.count({ where: estimateWhereForMember(m) }),
    prisma.visitSchedule.count({ where: { AND: [visitWhere, { salesContract: { isNot: null } }] } }),
    prisma.purchaseItem.count({ where: { visitSchedule: visitWhere } }),
    prisma.accessLog.count({ where: { AND: [logWhere, { action: 'login' }] } }),
    prisma.accessLog.findFirst({
      where: { AND: [logWhere, { action: 'login' }] },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.visitSchedule.findMany({
      where: { AND: [visitWhere, { visitDate: { gte: twelveMonthsAgo } }] },
      select: { visitDate: true, status: true, purchaseAmount: true },
    }),
    prisma.visitSchedule.findMany({
      where: visitWhere,
      orderBy: { visitDate: 'desc' },
      take: 20,
      select: {
        id: true, visitDate: true, startTime: true, status: true, purchaseAmount: true,
        store: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.deal.findMany({
      where: dealWhere,
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, occurredAt: true, detail: true, purchaseAmount: true,
        store: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    // 過去参考値（名前照合）が混じっているかの判定
    prisma.visitSchedule.count({ where: { memberId: null, storeId: m.storeId, staffName: m.name.trim() } }),
    prisma.deal.count({ where: { memberId: null, storeId: m.storeId, createdByType: 'store', createdByName: m.name.trim() } }),
  ])

  // 月次推移（直近12ヶ月・JSTバケット）
  const monthlyMap: Record<string, { visitCount: number; purchaseAmount: number }> = {}
  for (let i = 11; i >= 0; i--) monthlyMap[jstMonthKey(subMonths(now, i))] = { visitCount: 0, purchaseAmount: 0 }
  for (const v of trendVisits) {
    const key = jstMonthKey(v.visitDate)
    if (!(key in monthlyMap)) continue
    monthlyMap[key].visitCount++
    if (v.status === 'completed') monthlyMap[key].purchaseAmount += v.purchaseAmount ?? 0
  }
  const monthlyTrend = Object.entries(monthlyMap).map(([month, d]) => ({
    month: `${month.slice(5)}月`,
    visitCount: d.visitCount,
    purchaseAmount: d.purchaseAmount,
  }))

  return NextResponse.json({
    member,
    stats: {
      totalVisits,
      completedVisits,
      totalPurchaseAmount: amountAgg._sum.purchaseAmount ?? 0,
      currentMonthPurchaseAmount: currentMonthAmountAgg._sum.purchaseAmount ?? 0,
      dealCount,
      estimateCount,
      contractCount,
      purchaseItemCount,
      loginCount,
      lastLoginAt: lastLogin?.createdAt ?? null,
    },
    monthlyTrend,
    recentVisits,
    recentDeals,
    includesLegacyData: legacyVisitCount + legacyDealCount > 0,
  })
}
