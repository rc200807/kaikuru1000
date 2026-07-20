import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries } from '@/lib/analytics/period'
import { DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveAnalyticsParams, dealWhere, dateWhere, buildMeta, WON_STATUSES, LOST_STATUSES,
} from '../_lib/params'

export const dynamic = 'force-dynamic'

const CREATED_BY_LABEL: Record<string, string> = {
  store: '店舗', admin: '本部', superadmin: '本部', hr: '本部', customer: '顧客', partner: 'パートナー',
}
const INQUIRY_TYPE_LABEL: Record<string, string> = {
  assessment: '査定', purchase: '買取', estate: '遺品整理', other: 'その他',
}
const INQUIRY_STATUS_LABEL: Record<string, string> = { new: '新規', contacted: '対応中', completed: '完了' }
const VISIT_REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: '承認待ち', approved: '承認済み', counter_proposed: '代替日提案', customer_accepted: '顧客承諾',
  customer_declined: '顧客辞退', cancelled: 'キャンセル',
}
/** ファネル表示順（進行ステータスのみ） */
const FUNNEL_STATUSES = ['inquiry', 'visit_decided', 'estimate_only', 'contract', 'completed']

// 案件タブ: ステータスファネル・流入経路・問い合わせ・訪問リクエスト
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, compare, granularity, filters } = params

  const inquiryWhere = (r: typeof range) => ({
    createdAt: dateWhere(r),
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
  })

  const [
    deals, contracts, inquiryTypeAgg, inquiryStatusAgg, dealsFromInquiry, visitRequestAgg, lostDeals,
    prevDeals,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: dealWhere(range, filters),
      select: {
        occurredAt: true, status: true, category: true, createdByType: true, storeId: true,
        purchaseAmount: true, user: { select: { leadSource: true } },
      },
    }),
    prisma.salesContract.findMany({
      where: { agreedAt: dateWhere(range), dealId: { not: null } },
      select: { agreedAt: true, deal: { select: { occurredAt: true } } },
    }),
    prisma.inquiry.groupBy({ by: ['inquiryType'], where: inquiryWhere(range), _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['status'], where: inquiryWhere(range), _count: { _all: true } }),
    prisma.deal.count({ where: { ...dealWhere(range, filters), inquiryId: { not: null } } }),
    prisma.visitRequest.groupBy({
      by: ['status'],
      where: { createdAt: dateWhere(range), ...(filters.storeId ? { storeId: filters.storeId } : {}) },
      _count: { _all: true },
    }),
    prisma.deal.findMany({
      where: { ...dealWhere(range, filters), status: { in: LOST_STATUSES } },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, category: true, occurredAt: true, detail: true,
        user: { select: { name: true, leadSource: true } }, store: { select: { name: true } },
      },
    }),
    compare
      ? prisma.deal.findMany({ where: dealWhere(compare, filters), select: { status: true } })
      : Promise.resolve(null),
  ])

  const isWon = (s: string) => WON_STATUSES.includes(s)
  const isLost = (s: string) => LOST_STATUSES.includes(s)
  const wonCount = deals.filter(d => isWon(d.status)).length
  const lostCount = deals.filter(d => isLost(d.status)).length
  const contractRate = deals.length > 0 ? wonCount / deals.length : 0
  const lostRate = deals.length > 0 ? lostCount / deals.length : 0
  // 訪問決定率 = inquiry と未訪問失注以外へ進んだ案件の割合
  const progressed = deals.filter(d => d.status !== 'inquiry' && d.status !== 'lost_no_visit' && d.status !== 'lost').length
  const visitDecisionRate = deals.length > 0 ? progressed / deals.length : 0

  // 平均リードタイム（案件発生→契約成立、日数）
  const leadTimes = contracts
    .filter(c => c.deal)
    .map(c => (c.agreedAt.getTime() - c.deal!.occurredAt.getTime()) / 86_400_000)
    .filter(days => days >= 0)
  const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length : 0

  const prevWonCount = prevDeals ? prevDeals.filter(d => isWon(d.status)).length : null
  const prevContractRate = prevDeals ? (prevDeals.length > 0 ? (prevWonCount ?? 0) / prevDeals.length : 0) : null

  // ステータスファネル（進行順）+ 失注内訳
  const statusCount = new Map<string, number>()
  for (const d of deals) statusCount.set(d.status, (statusCount.get(d.status) ?? 0) + 1)
  // ファネルは「そのステージ以降まで進んだ件数」の累積で表現
  const funnelSteps = FUNNEL_STATUSES.map((status, idx) => {
    const reached = FUNNEL_STATUSES.slice(idx).reduce((s, st) => s + (statusCount.get(st) ?? 0), 0)
      + (idx <= 1 ? (statusCount.get('lost_after_visit') ?? 0) : 0) // 訪問失注は訪問決定までは到達
      + (idx === 0 ? (statusCount.get('lost_no_visit') ?? 0) + (statusCount.get('lost') ?? 0) : 0)
    return { name: DEAL_STATUS_LABEL[status] ?? status, count: reached }
  })
  const lostBreakdown = LOST_STATUSES
    .filter(s => (statusCount.get(s) ?? 0) > 0)
    .map(s => ({ name: DEAL_STATUS_LABEL[s] ?? s, count: statusCount.get(s) ?? 0 }))

  // ステータス別時系列（積み上げ）
  const buckets = buildBuckets(range, granularity)
  const statusKeys = [...statusCount.keys()]
  const seriesByStatus = new Map(statusKeys.map(s => [
    s, fillSeries(buckets, deals.filter(d => d.status === s), granularity, d => d.occurredAt),
  ]))
  const statusSeries: SeriesPoint[] = buckets.map((b, i) => {
    const point: SeriesPoint = { label: b.label }
    for (const s of statusKeys) point[DEAL_STATUS_LABEL[s] ?? s] = seriesByStatus.get(s)?.[i] ?? 0
    return point
  })

  // 流入経路別（件数 + 成約金額）
  const leadAgg = new Map<string, { count: number; won: number; amount: number }>()
  for (const d of deals) {
    const name = d.user.leadSource ?? '未設定'
    const cur = leadAgg.get(name) ?? { count: 0, won: 0, amount: 0 }
    cur.count++
    if (isWon(d.status)) { cur.won++; cur.amount += d.purchaseAmount ?? 0 }
    leadAgg.set(name, cur)
  }
  const leadSources = [...leadAgg.entries()]
    .map(([name, v]) => ({ name, count: v.count, amount: v.amount }))
    .sort((a, b) => b.count - a.count)

  // 作成者種別内訳
  const createdByAgg = new Map<string, number>()
  for (const d of deals) {
    const name = CREATED_BY_LABEL[d.createdByType ?? ''] ?? '不明'
    createdByAgg.set(name, (createdByAgg.get(name) ?? 0) + 1)
  }
  const createdBy = [...createdByAgg.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  // 問い合わせ分析
  const totalInquiries = inquiryTypeAgg.reduce((s, g) => s + g._count._all, 0)
  const inquiryTypes = inquiryTypeAgg
    .map(g => ({ name: INQUIRY_TYPE_LABEL[g.inquiryType] ?? g.inquiryType, count: g._count._all }))
    .sort((a, b) => b.count - a.count)
  const inquiryStatuses = inquiryStatusAgg
    .map(g => ({ name: INQUIRY_STATUS_LABEL[g.status] ?? g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count)
  const inquiryConversion = totalInquiries > 0 ? dealsFromInquiry / totalInquiries : 0

  // 訪問リクエスト
  const vrTotal = visitRequestAgg.reduce((s, g) => s + g._count._all, 0)
  const vrApproved = visitRequestAgg
    .filter(g => g.status === 'approved' || g.status === 'customer_accepted')
    .reduce((s, g) => s + g._count._all, 0)
  const visitRequests = visitRequestAgg
    .map(g => ({ name: VISIT_REQUEST_STATUS_LABEL[g.status] ?? g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  const response: AnalyticsResponse = {
    meta: buildMeta(params),
    kpis: {
      dealCount: { value: deals.length, compareValue: prevDeals ? prevDeals.length : null },
      wonCount: { value: wonCount, compareValue: prevWonCount },
      contractRate: { value: contractRate, compareValue: prevContractRate },
      lostRate: { value: lostRate, compareValue: null },
      avgLeadTime: { value: avgLeadTime, compareValue: null },
      visitDecisionRate: { value: visitDecisionRate, compareValue: null },
      inquiryCount: { value: totalInquiries, compareValue: null },
      inquiryConversion: { value: inquiryConversion, compareValue: null },
      visitRequestCount: { value: vrTotal, compareValue: null },
      visitRequestApproval: { value: vrTotal > 0 ? vrApproved / vrTotal : 0, compareValue: null },
    },
    series: { statusSeries },
    breakdowns: { funnelSteps, lostBreakdown, leadSources, createdBy, inquiryTypes, inquiryStatuses, visitRequests },
    tables: {
      lostDeals: lostDeals.map(d => ({
        customer: d.user.name,
        store: d.store?.name ?? '—',
        category: DEAL_CATEGORY_LABEL[d.category] ?? d.category,
        status: DEAL_STATUS_LABEL[d.status] ?? d.status,
        leadSource: d.user.leadSource ?? '未設定',
        occurredAt: d.occurredAt.toISOString(),
        dealId: d.id,
      })),
    },
  }
  return NextResponse.json(response)
}
