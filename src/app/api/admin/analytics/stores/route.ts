import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import type { AnalyticsResponse } from '@/lib/analytics/types'
import {
  resolveAnalyticsParams, dealWhere, customerWhere, visitWhere, dateWhere, buildMeta, WON_STATUSES,
} from '../_lib/params'

export const dynamic = 'force-dynamic'

const ENTITY_TYPE_LABEL: Record<string, string> = { corporation: '法人', sole_proprietor: '個人事業主' }

// 店舗・スタッフタブ: 店舗別実績・都道府県・運営者・スタッフ・研修視聴
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, filters } = params

  const [stores, operators, deals, newUsers, completedVisits, trainingViews, prevDeals] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true, name: true, prefecture: true, storeStatus: true, isActive: true,
        openingDate: true, operatorId: true,
      },
    }),
    prisma.operator.findMany({ select: { id: true, name: true, entityType: true } }),
    prisma.deal.findMany({
      where: dealWhere(range, filters),
      select: { storeId: true, status: true, purchaseAmount: true, billingAmount: true },
    }),
    prisma.user.groupBy({ by: ['storeId'], where: customerWhere(range, filters), _count: { _all: true } }),
    prisma.visitSchedule.findMany({
      where: visitWhere(range, filters, 'completed'),
      select: { memberId: true, staffName: true, storeId: true, purchaseAmount: true },
    }),
    prisma.trainingVideoView.groupBy({
      by: ['storeId'],
      _sum: { playCount: true },
      orderBy: { _sum: { playCount: 'desc' } },
      take: 10,
    }),
    compare
      ? prisma.deal.findMany({
          where: dealWhere(compare, filters),
          select: { storeId: true, status: true, purchaseAmount: true },
        })
      : Promise.resolve(null),
  ])

  const storeMap = new Map(stores.map(s => [s.id, s]))
  const operatorMap = new Map(operators.map(o => [o.id, o]))
  const isWon = (s: string) => WON_STATUSES.includes(s)

  // KPI
  const activeStores = stores.filter(s => s.isActive && s.storeStatus !== 'closed').length
  const newOpenings = stores.filter(s => s.openingDate && s.openingDate >= range.from && s.openingDate < range.to).length
  const storesWithDeals = new Set(deals.filter(d => d.storeId).map(d => d.storeId)).size
  const totalPurchase = deals.filter(d => isWon(d.status)).reduce((s, d) => s + (d.purchaseAmount ?? 0), 0)
  const avgPerStore = storesWithDeals > 0 ? totalPurchase / storesWithDeals : 0

  const prevTotalPurchase = prevDeals
    ? prevDeals.filter(d => isWon(d.status)).reduce((s, d) => s + (d.purchaseAmount ?? 0), 0)
    : null
  const prevStoresWithDeals = prevDeals ? new Set(prevDeals.filter(d => d.storeId).map(d => d.storeId)).size : null

  // 店舗別集計（実績テーブル + TOP20バー）
  const perf = new Map<string, { deals: number; won: number; purchase: number; billing: number }>()
  for (const d of deals) {
    const key = d.storeId ?? '__none__'
    const cur = perf.get(key) ?? { deals: 0, won: 0, purchase: 0, billing: 0 }
    cur.deals++
    if (isWon(d.status)) { cur.won++; cur.purchase += d.purchaseAmount ?? 0; cur.billing += d.billingAmount ?? 0 }
    perf.set(key, cur)
  }
  const customersByStore = new Map(newUsers.map(g => [g.storeId ?? '__none__', g._count._all]))
  const visitsByStore = new Map<string, number>()
  for (const v of completedVisits) visitsByStore.set(v.storeId, (visitsByStore.get(v.storeId) ?? 0) + 1)

  const storeIds = new Set([...perf.keys(), ...customersByStore.keys(), ...visitsByStore.keys()])
  storeIds.delete('__none__')
  const storePerformance = [...storeIds]
    .map(id => {
      const p = perf.get(id) ?? { deals: 0, won: 0, purchase: 0, billing: 0 }
      return {
        store: storeMap.get(id)?.name ?? '不明',
        prefecture: storeMap.get(id)?.prefecture ?? '—',
        operator: storeMap.get(id)?.operatorId ? (operatorMap.get(storeMap.get(id)!.operatorId!)?.name ?? '—') : '—',
        customers: customersByStore.get(id) ?? 0,
        visits: visitsByStore.get(id) ?? 0,
        deals: p.deals,
        won: p.won,
        contractRate: p.deals > 0 ? p.won / p.deals : 0,
        purchase: p.purchase,
        billing: p.billing,
      }
    })
    .sort((a, b) => b.purchase - a.purchase)

  const storeTop = storePerformance.slice(0, 20).map(s => ({ name: s.store, amount: s.purchase }))

  // 都道府県別（店舗数 + 買取額）
  const prefAgg = new Map<string, { stores: number; amount: number }>()
  for (const s of stores.filter(s => s.isActive)) {
    const pref = s.prefecture ?? '未設定'
    const cur = prefAgg.get(pref) ?? { stores: 0, amount: 0 }
    cur.stores++
    prefAgg.set(pref, cur)
  }
  for (const d of deals.filter(d => isWon(d.status) && d.storeId)) {
    const pref = storeMap.get(d.storeId!)?.prefecture ?? '未設定'
    const cur = prefAgg.get(pref) ?? { stores: 0, amount: 0 }
    cur.amount += d.purchaseAmount ?? 0
    prefAgg.set(pref, cur)
  }
  const prefectures = [...prefAgg.entries()]
    .map(([name, v]) => ({ name, count: v.stores, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)

  // 運営者別実績 + 形態構成
  const operatorAgg = new Map<string, { deals: number; amount: number }>()
  for (const d of deals) {
    const opId = d.storeId ? storeMap.get(d.storeId)?.operatorId : null
    const name = opId ? (operatorMap.get(opId)?.name ?? '不明') : '運営者未設定'
    const cur = operatorAgg.get(name) ?? { deals: 0, amount: 0 }
    cur.deals++
    if (isWon(d.status)) cur.amount += d.purchaseAmount ?? 0
    operatorAgg.set(name, cur)
  }
  const operatorPerf = [...operatorAgg.entries()]
    .map(([name, v]) => ({ name, count: v.deals, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)
  const entityTypeAgg = new Map<string, number>()
  for (const o of operators) {
    const name = ENTITY_TYPE_LABEL[o.entityType] ?? o.entityType
    entityTypeAgg.set(name, (entityTypeAgg.get(name) ?? 0) + 1)
  }
  const entityTypes = [...entityTypeAgg.entries()].map(([name, count]) => ({ name, count }))

  // スタッフ別実績（memberId 優先、なければ staffName スナップショット）
  const staffAgg = new Map<string, { name: string | null; memberId: string | null; visits: number; amount: number }>()
  for (const v of completedVisits) {
    const key = v.memberId ?? `name:${v.staffName ?? '未設定'}`
    const cur = staffAgg.get(key) ?? { name: v.staffName, memberId: v.memberId, visits: 0, amount: 0 }
    cur.visits++
    cur.amount += v.purchaseAmount ?? 0
    if (!cur.name && v.staffName) cur.name = v.staffName
    staffAgg.set(key, cur)
  }
  const memberIds = [...staffAgg.values()].map(v => v.memberId).filter((id): id is string => id != null)
  const members = memberIds.length > 0
    ? await prisma.storeMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, storeId: true } })
    : []
  const memberMap = new Map(members.map(m => [m.id, m]))
  const staffPerf = [...staffAgg.values()]
    .map(v => ({
      name: v.memberId ? (memberMap.get(v.memberId)?.name ?? v.name ?? '不明') : (v.name ?? '未設定'),
      store: v.memberId ? (storeMap.get(memberMap.get(v.memberId)?.storeId ?? '')?.name ?? '—') : '—',
      count: v.visits,
      amount: v.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)

  // 店舗別研修動画視聴 TOP10
  const trainingTop = trainingViews.map(g => ({
    name: storeMap.get(g.storeId)?.name ?? '不明',
    count: g._sum.playCount ?? 0,
  }))

  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      activeStores: { value: activeStores, compareValue: null },
      newOpenings: { value: newOpenings, compareValue: null },
      storesWithDeals: { value: storesWithDeals, compareValue: prevStoresWithDeals },
      avgPerStore: {
        value: avgPerStore,
        compareValue: prevDeals && prevStoresWithDeals ? (prevTotalPurchase ?? 0) / Math.max(1, prevStoresWithDeals) : null,
      },
    },
    series: {},
    breakdowns: { storeTop, prefectures, operatorPerf, entityTypes, trainingTop, staffTop: staffPerf.map(s => ({ name: s.name, amount: s.amount })) },
    tables: { storePerformance, staffPerf },
  }
  return NextResponse.json(response)
}
