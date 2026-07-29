import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { jstMonthKey } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

/** 直近nヶ月の "yyyy-MM"（JST基準の当月を末尾に） */
function lastMonths(n: number): string[] {
  const [cy, cm] = jstMonthKey(new Date()).split('-').map(Number)
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(cy, cm - 1 - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * システム決済（店舗の支払い）の集計。
 * 生行をJSに載せず、DB側の groupBy / aggregate のみで組み立てる。
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const monthsParam = Number(request.nextUrl.searchParams.get('months')) || 12
  const months = lastMonths(Math.min(36, Math.max(3, monthsParam)))
  const currentMonth = jstMonthKey(new Date())

  const [
    paidAll, paidThisMonth, unresolvedCount, activeStores,
    monthlyGroups, storeGroups,
  ] = await Promise.all([
    prisma.storePayment.aggregate({ where: { status: 'paid' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.storePayment.aggregate({
      where: { status: 'paid', billingMonth: currentMonth },
      _sum: { amount: true }, _count: { _all: true },
    }),
    prisma.storePayment.count({ where: { status: { in: ['failed', 'no_card'] } } }),
    prisma.systemFeeSetting.count({ where: { isActive: true, monthlyAmount: { gt: 0 } } }),
    // 月次系列（billingMonth × status）
    prisma.storePayment.groupBy({
      by: ['billingMonth', 'status'],
      where: { billingMonth: { in: months } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // 店舗別（支払い済みの累計）
    prisma.storePayment.groupBy({
      by: ['storeId'],
      where: { status: 'paid' },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),
  ])

  // 月次系列をゼロ埋みで展開
  const byMonth = months.map(month => {
    const rows = monthlyGroups.filter(g => g.billingMonth === month)
    const paid = rows.filter(g => g.status === 'paid')
    const failed = rows.filter(g => g.status === 'failed' || g.status === 'no_card')
    const [y, m] = month.split('-')
    return {
      month,
      label: `${y.slice(2)}/${Number(m)}月`,
      paidAmount: paid.reduce((s, g) => s + (g._sum.amount ?? 0), 0),
      paidCount: paid.reduce((s, g) => s + g._count._all, 0),
      failedCount: failed.reduce((s, g) => s + g._count._all, 0),
    }
  })

  // 店舗名の解決（TOP10のIDのみ）
  const storeIds = storeGroups.map(g => g.storeId)
  const stores = storeIds.length
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const nameMap = new Map(stores.map(s => [s.id, s.name]))
  const storeRanking = storeGroups.map(g => ({
    storeId: g.storeId,
    name: nameMap.get(g.storeId) ?? '不明',
    amount: g._sum.amount ?? 0,
    count: g._count._all,
  }))

  return NextResponse.json({
    kpis: {
      totalPaidAmount: paidAll._sum.amount ?? 0,
      totalPaidCount: paidAll._count._all,
      thisMonthPaidAmount: paidThisMonth._sum.amount ?? 0,
      thisMonthPaidCount: paidThisMonth._count._all,
      unresolvedCount,
      activeStores,
    },
    byMonth,
    storeRanking,
  })
}
