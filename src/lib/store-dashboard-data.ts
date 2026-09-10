// 店舗ダッシュボードの集計ロジック（店舗ポータル /api/store/dashboard と
// 管理ポータル /api/admin/stores/[id]/dashboard で共用）。
// レスポンス形状は従来の店舗ダッシュボードAPIと完全一致させること（店舗側の退行防止）。
// 複数店舗（運営者スコープ）対応: storeId に配列を渡すと選択店舗群の合算になる。
// 単一店舗時は既存キーの型・値が完全一致すること。追加は optional キーのみ
// （myStoreRanks / perStore / recentDeals[].storeName）。
import { prisma } from '@/lib/prisma'
import { startOfMonth, subMonths, startOfDay } from 'date-fns'
import { jstMonthKey } from '@/lib/datetime'
import {
  monthlyPurchaseAmount,
  purchasedDealWhere,
  recentMonthKeys,
  sumPurchaseAmount,
} from '@/lib/purchase-aggregation'
import { NON_TEST_STORE_DEAL } from '@/lib/test-store'

export type StoreDashboardOptions = {
  /** true でランキングTOP10に金額(amount)を含める（管理向け。店舗向けは相対barのみ） */
  revealAmounts?: boolean
}

export async function buildStoreDashboard(storeIdInput: string | string[], opts: StoreDashboardOptions = {}) {
  const storeIds = Array.isArray(storeIdInput) ? storeIdInput : [storeIdInput]
  const isMulti = storeIds.length > 1
  const storeId = storeIds[0] // 単一店舗時の互換用（myRank 判定など）
  const storeFilter = { storeId: { in: storeIds } }
  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const twelveMonthsAgo = startOfMonth(subMonths(now, 11))
  const today = startOfDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // ダッシュボードの集計クエリは互いに独立しているので、1回の Promise.all でまとめて投げる。
  // 以前は11本を直列に await していたため、関数→DBの往復がそのまま11回ぶん積み上がっていた。
  const [
    myVisits,
    storeAmountAgg,
    totalStores,
    todayCount,
    recentDealRows,
    myDeals,
    dealStatusAgg,
    leadAgg,
    completedByUser,
    scopeStoreNames,
  ] = await Promise.all([
    // 自店舗（選択店舗群）の訪問データ（直近12ヶ月）。訪問件数の集計に使う
    prisma.visitSchedule.findMany({
      where: { ...storeFilter, visitDate: { gte: twelveMonthsAgo } },
      select: { visitDate: true, status: true, storeId: true },
    }),
    // 全店舗の買取金額ランキング（当月）。買取金額の正は案件（Deal）なのでそちらで集計する。
    // テスト店舗はランキング・母数の対象外（自店舗がテスト店舗なら順位は null になる）
    prisma.deal.groupBy({
      by: ['storeId'],
      where: purchasedDealWhere({ occurredAt: { gte: currentMonthStart }, storeId: { not: null }, ...NON_TEST_STORE_DEAL }),
      _sum: { purchaseAmount: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
    }),
    prisma.store.count({ where: { isActive: true, isTestStore: false } }),
    // 本日の訪問件数（KPI用）
    prisma.visitSchedule.count({
      where: { ...storeFilter, visitDate: { gte: today, lt: tomorrow } },
    }),
    // 直近の案件（発生日の新しい順に最大10件）
    prisma.deal.findMany({
      where: storeFilter,
      orderBy: { occurredAt: 'desc' },
      take: 10,
      include: {
        user: { select: { name: true, address: true } },
        store: { select: { name: true } },
      },
    }),
    // 自店舗の案件（直近12ヶ月：推移用）
    prisma.deal.findMany({
      where: { ...storeFilter, createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true, storeId: true },
    }),
    // 案件ステータスの内訳（全期間）
    prisma.deal.groupBy({
      by: ['status'],
      where: storeFilter,
      _count: { _all: true },
    }),
    // 流入経路の内訳（自店舗の顧客）
    prisma.user.groupBy({
      by: ['leadSource'],
      where: storeFilter,
      _count: { _all: true },
    }),
    // リピート率の母数（買取実績のある顧客ごとの案件数）
    prisma.deal.groupBy({
      by: ['userId'],
      where: purchasedDealWhere(storeFilter),
      _count: { _all: true },
    }),
    // 複数店舗スコープのときだけ、選択店舗の名前
    isMulti
      ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  // ── 自店舗の当月・前月買取金額（案件＋宅配買取。purchase-aggregation.ts が正） ──
  const prevMonthStart = startOfMonth(subMonths(now, 1))
  const currentMonthKey = jstMonthKey(now)
  const prevMonthKey = jstMonthKey(prevMonthStart)
  const shipmentStoreFilter = { user: { storeId: { in: storeIds } } }
  const [currentMonthTotals, prevMonthTotals] = await Promise.all([
    sumPurchaseAmount(
      { ...storeFilter, occurredAt: { gte: currentMonthStart } },
      { ...shipmentStoreFilter, shipmentMonth: currentMonthKey },
    ),
    sumPurchaseAmount(
      { ...storeFilter, occurredAt: { gte: prevMonthStart, lt: currentMonthStart } },
      { ...shipmentStoreFilter, shipmentMonth: prevMonthKey },
    ),
  ])
  const currentMonthAmount = currentMonthTotals.amount
  const prevMonthAmount = prevMonthTotals.amount

  // storeId → 店舗名の解決（ランキングに載る店舗のみ取得）
  const rankedStoreIds = storeAmountAgg.map(a => a.storeId).filter((id): id is string => !!id)
  const storeNames = rankedStoreIds.length > 0
    ? await prisma.store.findMany({
        where: { id: { in: rankedStoreIds } },
        select: { id: true, name: true },
      })
    : []
  const storeNameMap = new Map(storeNames.map(s => [s.id, s.name]))

  const ranking = storeAmountAgg
    .filter((a): a is typeof a & { storeId: string } => !!a.storeId)
    .map(a => ({
      storeId: a.storeId,
      name: storeNameMap.get(a.storeId) ?? '',
      amount: a._sum.purchaseAmount ?? 0,
    }))

  // 自店舗の順位（複数選択時は合算に順位が定義できないため null。店舗別順位は myStoreRanks で返す）
  const myRankIndex = ranking.findIndex(r => r.storeId === storeId)
  const myRank = isMulti ? null : (myRankIndex >= 0 ? myRankIndex + 1 : null)

  // TOP10（店舗向けは金額非表示のため amount を返さない。管理向けは revealAmounts で含める）
  const top10 = ranking.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    isMe: storeIds.includes(r.storeId),
    // 相対バー表示用（最大値比）
    ratio: ranking.length > 0 ? r.amount / ranking[0].amount : 0,
    ...(opts.revealAmounts ? { amount: r.amount } : {}),
  }))

  // 複数選択時のみ: 選択店舗ごとの当月ランキング順位
  const scopeNameMap = new Map(scopeStoreNames.map(s => [s.id, s.name]))
  const myStoreRanks = isMulti
    ? storeIds.map(id => {
        const idx = ranking.findIndex(r => r.storeId === id)
        return { storeId: id, name: scopeNameMap.get(id) ?? '', rank: idx >= 0 ? idx + 1 : null }
      })
    : undefined

  // ── 月次買取金額の推移（自店舗・直近12ヶ月。案件＋宅配買取） ──
  const monthKeys = recentMonthKeys(12, now)
  const monthlyAmountMap = await monthlyPurchaseAmount(monthKeys, storeFilter, shipmentStoreFilter)
  const monthlyPurchaseAmountSeries = monthKeys.map(month => ({
    month: month.slice(5) + '月',
    amount: monthlyAmountMap[month] ?? 0,
  }))

  // ── 月次訪問件数の推移（自店舗・直近12ヶ月） ──
  const monthlyVisitMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyVisitMap[jstMonthKey(subMonths(now, i))] = 0
  for (const v of myVisits) {
    const m = jstMonthKey(v.visitDate)
    if (m in monthlyVisitMap) monthlyVisitMap[m]++
  }
  const monthlyVisits = Object.entries(monthlyVisitMap).map(([month, count]) => ({
    month: month.slice(5) + '月',
    count,
  }))

  // ── 直近の案件（発生日の新しい順に最大10件） ──
  const recentDeals = recentDealRows.map(d => ({
    id: d.id,
    customerName: d.user.name,
    address: d.user.address,
    status: d.status,
    occurredAt: d.occurredAt,
    purchaseAmount: d.purchaseAmount,
    billingAmount: d.billingAmount,
    ...(isMulti ? { storeId: d.storeId, storeName: d.store?.name ?? null } : {}),
  }))

  // ── 当月訪問件数 / 当月完了件数 ──
  const currentMonthVisitCount = myVisits.filter(v => v.visitDate >= currentMonthStart).length
  const currentMonthCompletedCount = myVisits.filter(v => v.visitDate >= currentMonthStart && v.status === 'completed').length

  // ── 前月比（訪問件数。買取金額は上で案件＋宅配から算出済み） ──
  const prevMonthVisitCount = myVisits.filter(v => v.visitDate >= prevMonthStart && v.visitDate < currentMonthStart).length

  const monthlyDealMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) monthlyDealMap[jstMonthKey(subMonths(now, i))] = 0
  for (const d of myDeals) {
    const m = jstMonthKey(d.createdAt)
    if (m in monthlyDealMap) monthlyDealMap[m]++
  }
  const monthlyDeals = Object.entries(monthlyDealMap).map(([month, count]) => ({ month: month.slice(5) + '月', count }))
  const currentMonthDealCount = myDeals.filter(d => d.createdAt >= currentMonthStart).length
  const prevMonthDealCount = myDeals.filter(d => d.createdAt >= prevMonthStart && d.createdAt < currentMonthStart).length

  // ── 案件ステータスの内訳＋契約率（自店舗・全期間） ──
  const dealStatusBreakdown = dealStatusAgg.map(g => ({ status: g.status, count: g._count._all }))
  const totalDeals = dealStatusBreakdown.reduce((s, g) => s + g.count, 0)
  const wonDeals = dealStatusBreakdown
    .filter(g => g.status === 'contract' || g.status === 'completed')
    .reduce((s, g) => s + g.count, 0)
  const contractRate = totalDeals > 0 ? wonDeals / totalDeals : 0

  // ── 流入経路の内訳（自店舗の顧客） ──
  const leadSourceBreakdown = leadAgg
    .map(g => ({ name: g.leadSource ?? '未設定', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // ── リピート率（買取実績が2件以上の顧客 / 買取実績が1件以上の顧客） ──
  const customersWithPurchase = completedByUser.length
  const repeatCustomers = completedByUser.filter(g => g._count._all >= 2).length
  const repeatRate = customersWithPurchase > 0 ? repeatCustomers / customersWithPurchase : 0

  // ── 複数選択時のみ: 店舗別の当月サマリ（比較セクション用） ──
  // 買取金額は店舗ごとにDB側で集計する（案件＋宅配買取）。
  const perStoreAmounts = isMulti
    ? await Promise.all(storeIds.map(async id => ({
        id,
        amount: (await sumPurchaseAmount(
          { storeId: id, occurredAt: { gte: currentMonthStart } },
          { user: { storeId: id }, shipmentMonth: currentMonthKey },
        )).amount,
      })))
    : []
  const perStoreAmountMap = new Map(perStoreAmounts.map(a => [a.id, a.amount]))
  const perStore = isMulti
    ? storeIds.map(id => {
        const visits = myVisits.filter(v => v.storeId === id && v.visitDate >= currentMonthStart)
        return {
          storeId: id,
          name: scopeNameMap.get(id) ?? '',
          currentMonthAmount: perStoreAmountMap.get(id) ?? 0,
          currentMonthVisitCount: visits.length,
          currentMonthCompletedCount: visits.filter(v => v.status === 'completed').length,
          currentMonthDealCount: myDeals.filter(d => d.storeId === id && d.createdAt >= currentMonthStart).length,
          rank: myStoreRanks?.find(r => r.storeId === id)?.rank ?? null,
        }
      })
    : undefined

  return {
    myRank,
    totalStores,
    top10,
    ...(myStoreRanks ? { myStoreRanks } : {}),
    ...(perStore ? { perStore } : {}),
    currentMonthAmount,
    currentMonthVisitCount,
    currentMonthCompletedCount,
    monthlyPurchaseAmount: monthlyPurchaseAmountSeries,
    monthlyVisits,
    todayCount,
    recentDeals,
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
  }
}
