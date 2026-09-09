import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'
import { startOfMonth } from 'date-fns'
import { purchasedDealWhere } from '@/lib/purchase-aggregation'
import { NON_TEST_STORE_DEAL, NON_TEST_STORE_VISIT } from '@/lib/test-store'

// 全店舗横断メンバーランキング（当月）
// memberId が記録されたデータのみ集計する（名前照合の横断集計は重く不正確なため対象外。
// memberId は 2026-07 以降の書き込みから記録されている）
export async function GET(request: NextRequest) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const monthStart = startOfMonth(new Date())

  const [visitAgg, completedAgg, amountAgg, dealAgg, contractVisits] = await Promise.all([
    // 当月の担当訪問数
    prisma.visitSchedule.groupBy({
      by: ['memberId'],
      where: { memberId: { not: null }, visitDate: { gte: monthStart }, ...NON_TEST_STORE_VISIT },
      _count: { _all: true },
    }),
    // 当月の完了訪問（件数）
    prisma.visitSchedule.groupBy({
      by: ['memberId'],
      where: { memberId: { not: null }, status: 'completed', visitDate: { gte: monthStart }, ...NON_TEST_STORE_VISIT },
      _count: { _all: true },
    }),
    // 当月の買取金額（担当案件）。買取金額の正は案件（Deal.purchaseAmount）で、
    // 訪問側の値は案件詳細から品目を登録した取引では入らない
    prisma.deal.groupBy({
      by: ['memberId'],
      where: purchasedDealWhere({ memberId: { not: null }, occurredAt: { gte: monthStart }, ...NON_TEST_STORE_DEAL }),
      _sum: { purchaseAmount: true },
    }),
    // 当月の作成案件数
    prisma.deal.groupBy({
      by: ['memberId'],
      where: { memberId: { not: null }, createdAt: { gte: monthStart }, ...NON_TEST_STORE_DEAL },
      _count: { _all: true },
    }),
    // 当月の契約数（帰属訪問のうち売買契約書あり）
    prisma.visitSchedule.findMany({
      where: { memberId: { not: null }, visitDate: { gte: monthStart }, salesContract: { isNot: null }, ...NON_TEST_STORE_VISIT },
      select: { memberId: true },
    }),
  ])

  const perf = new Map<string, { visitCount: number; completedCount: number; purchaseAmount: number; dealCount: number; contractCount: number }>()
  const ensure = (id: string) => {
    let p = perf.get(id)
    if (!p) { p = { visitCount: 0, completedCount: 0, purchaseAmount: 0, dealCount: 0, contractCount: 0 }; perf.set(id, p) }
    return p
  }
  for (const g of visitAgg) if (g.memberId) ensure(g.memberId).visitCount = g._count._all
  for (const g of completedAgg) if (g.memberId) ensure(g.memberId).completedCount = g._count._all
  for (const g of amountAgg) if (g.memberId) ensure(g.memberId).purchaseAmount = g._sum.purchaseAmount ?? 0
  for (const g of dealAgg) if (g.memberId) ensure(g.memberId).dealCount = g._count._all
  for (const v of contractVisits) if (v.memberId) ensure(v.memberId).contractCount++

  const memberIds = [...perf.keys()]
  const members = memberIds.length > 0
    ? await prisma.storeMember.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, name: true, avatar: true, store: { select: { id: true, name: true } } },
      })
    : []
  const memberMap = new Map(members.map(m => [m.id, m]))

  const ranking = memberIds
    .map(id => {
      const m = memberMap.get(id)
      return {
        memberId: id,
        name: m?.name ?? '（削除済みメンバー）',
        avatar: m?.avatar ?? null,
        storeId: m?.store.id ?? null,
        storeName: m?.store.name ?? null,
        ...perf.get(id)!,
      }
    })
    .sort((a, b) => b.purchaseAmount - a.purchaseAmount || b.completedCount - a.completedCount || b.visitCount - a.visitCount)

  return NextResponse.json({ ranking, since: monthStart })
}
