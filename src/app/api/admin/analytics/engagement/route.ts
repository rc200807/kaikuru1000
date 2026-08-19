import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, fillSeries, rangeDays } from '@/lib/analytics/period'
import { jstDateKey } from '@/lib/datetime'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import { resolveAnalyticsParams, dateWhere, visitWhere, dealWhere, customerWhere, buildMeta, WON_STATUSES } from '../_lib/params'
import { formAdminLabel } from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

const INQUIRY_TYPE_LABEL: Record<string, string> = {
  assessment: '査定', purchase: '買取', estate: '遺品整理', other: 'その他',
}
const USER_TYPE_LABEL: Record<string, string> = {
  customer: '顧客', store: '店舗', admin: '管理', sysadmin: 'システム', partner: 'パートナー',
}
const BUG_STATUS_LABEL: Record<string, string> = { open: '未対応', in_progress: '対応中', resolved: '解決済み' }

/** 詳細時系列（アクセスログ/LINE）を出す最大期間（日）。超える場合は件数のみ */
const DETAIL_SERIES_MAX_DAYS = 400

// 流入・接点タブ: リードソース効果・問い合わせ・フォーム・LINE・アクセス・エンゲージメント
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await resolveAnalyticsParams(request)
  const { range, granularity, filters } = params
  const withDetailSeries = rangeDays(range) <= DETAIL_SERIES_MAX_DAYS
  const notes: string[] = []
  if (!withDetailSeries) notes.push('期間が長いため、アクセスログとLINEの時系列は省略しています（件数のみ表示）')

  const [
    inquiries, formSubmissions, forms,
    lineUserTotal, lineUserLinked, lineInCount, lineOutCount, lineMessages,
    loginCount, accessLogs, visits,
    usersByLead, dealsWithLead,
    announcements, announcementReads, activeStoreCount,
    trainingPlayTotal, communityCount, questionCount, resolvedQuestionCount, bugAgg, chatCount,
  ] = await Promise.all([
    prisma.inquiry.findMany({
      where: { createdAt: dateWhere(range), ...(filters.storeId ? { storeId: filters.storeId } : {}) },
      select: { createdAt: true, inquiryType: true },
    }),
    prisma.formSubmission.groupBy({ by: ['formId'], where: { createdAt: dateWhere(range) }, _count: { _all: true } }),
    prisma.form.findMany({ select: { id: true, title: true, internalName: true } }),
    prisma.lineUser.count(),
    prisma.lineUser.count({ where: { userId: { not: null } } }),
    prisma.lineMessage.count({ where: { direction: 'inbound', sentAt: dateWhere(range) } }),
    prisma.lineMessage.count({ where: { direction: 'outbound', sentAt: dateWhere(range) } }),
    withDetailSeries
      ? prisma.lineMessage.findMany({ where: { sentAt: dateWhere(range) }, select: { direction: true, sentAt: true } })
      : Promise.resolve([]),
    prisma.accessLog.count({ where: { createdAt: dateWhere(range), action: 'login' } }),
    withDetailSeries
      ? prisma.accessLog.findMany({ where: { createdAt: dateWhere(range) }, select: { createdAt: true, userType: true } })
      : Promise.resolve([]),
    prisma.visitSchedule.findMany({
      where: visitWhere(range, filters),
      select: { visitDate: true, startTime: true },
    }),
    prisma.user.groupBy({ by: ['leadSource'], where: customerWhere(range, filters), _count: { _all: true } }),
    prisma.deal.findMany({
      where: dealWhere(range, filters),
      select: { status: true, purchaseAmount: true, user: { select: { leadSource: true } } },
    }),
    prisma.announcement.count({ where: { isPublished: true, publishedAt: dateWhere(range) } }),
    prisma.announcementRead.count({
      where: { announcement: { isPublished: true, publishedAt: dateWhere(range) } },
    }),
    prisma.store.count({ where: { isActive: true } }),
    prisma.trainingVideoView.aggregate({ _sum: { playCount: true } }),
    prisma.communityThread.count({ where: { createdAt: dateWhere(range) } }),
    prisma.question.count({ where: { createdAt: dateWhere(range) } }),
    prisma.question.count({ where: { createdAt: dateWhere(range), isResolved: true } }),
    prisma.bugReport.groupBy({ by: ['status'], where: { createdAt: dateWhere(range) }, _count: { _all: true } }),
    prisma.chatMessage.count({ where: { createdAt: dateWhere(range), deletedAt: null } }),
  ])

  const buckets = buildBuckets(range, granularity)

  // 問い合わせ種別の時系列（積み上げ）
  const inquiryTypes = ['assessment', 'purchase', 'estate', 'other']
  const inquirySeriesByType = new Map(inquiryTypes.map(t => [
    t, fillSeries(buckets, inquiries.filter(i => i.inquiryType === t), granularity, i => i.createdAt),
  ]))
  const inquirySeries: SeriesPoint[] = buckets.map((b, i) => {
    const point: SeriesPoint = { label: b.label }
    for (const t of inquiryTypes) point[INQUIRY_TYPE_LABEL[t]] = inquirySeriesByType.get(t)?.[i] ?? 0
    return point
  })

  // LINE 送受信の時系列
  const lineIn = fillSeries(buckets, lineMessages.filter(m => m.direction === 'inbound'), granularity, m => m.sentAt)
  const lineOut = fillSeries(buckets, lineMessages.filter(m => m.direction === 'outbound'), granularity, m => m.sentAt)
  const lineSeries: SeriesPoint[] = withDetailSeries
    ? buckets.map((b, i) => ({ label: b.label, 受信: lineIn[i], 送信: lineOut[i] }))
    : []

  // アクセスログの時系列（userType 積み上げ）
  const userTypes = [...new Set(accessLogs.map(a => a.userType))]
  const accessByType = new Map(userTypes.map(t => [
    t, fillSeries(buckets, accessLogs.filter(a => a.userType === t), granularity, a => a.createdAt),
  ]))
  const accessSeries: SeriesPoint[] = withDetailSeries
    ? buckets.map((b, i) => {
        const point: SeriesPoint = { label: b.label }
        for (const t of userTypes) point[USER_TYPE_LABEL[t] ?? t] = accessByType.get(t)?.[i] ?? 0
        return point
      })
    : []

  // 訪問の曜日×時間帯ヒートマップ（0=日〜6=土 × 8〜20時）
  const hourStart = 8
  const hourEnd = 20
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(hourEnd - hourStart + 1).fill(0))
  for (const v of visits) {
    const dateStr = jstDateKey(v.visitDate)
    const [y, m, d] = dateStr.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    let hour: number | null = null
    if (v.startTime && /^\d{1,2}:\d{2}$/.test(v.startTime)) hour = Number(v.startTime.split(':')[0])
    if (hour == null || Number.isNaN(hour)) continue
    const clamped = Math.min(Math.max(hour, hourStart), hourEnd)
    heatmap[weekday][clamped - hourStart]++
  }

  // リードソース効果テーブル（顧客獲得 → 案件 → 成約 → 金額）
  const leadEffect = new Map<string, { customers: number; deals: number; won: number; amount: number }>()
  for (const g of usersByLead) {
    const name = g.leadSource ?? '未設定'
    const cur = leadEffect.get(name) ?? { customers: 0, deals: 0, won: 0, amount: 0 }
    cur.customers += g._count._all
    leadEffect.set(name, cur)
  }
  for (const d of dealsWithLead) {
    const name = d.user.leadSource ?? '未設定'
    const cur = leadEffect.get(name) ?? { customers: 0, deals: 0, won: 0, amount: 0 }
    cur.deals++
    if (WON_STATUSES.includes(d.status)) { cur.won++; cur.amount += d.purchaseAmount ?? 0 }
    leadEffect.set(name, cur)
  }
  const leadSourceEffect = [...leadEffect.entries()]
    .map(([name, v]) => ({
      leadSource: name,
      customers: v.customers,
      deals: v.deals,
      won: v.won,
      cvr: v.deals > 0 ? v.won / v.deals : 0,
      amount: v.amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  // フォーム別回答数
  const formTitleMap = new Map(forms.map(f => [f.id, formAdminLabel(f)]))
  const formTop = formSubmissions
    .map(g => ({ name: formTitleMap.get(g.formId) ?? '不明なフォーム', count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const formTotal = formSubmissions.reduce((s, g) => s + g._count._all, 0)

  // お知らせ既読率（期間内公開分の 既読数 ÷ (公開数 × 稼働店舗数)）
  const announcementReadRate = announcements > 0 && activeStoreCount > 0
    ? announcementReads / (announcements * activeStoreCount)
    : 0

  const bugReports = bugAgg
    .map(g => ({ name: BUG_STATUS_LABEL[g.status] ?? g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  const communityActivity = [
    { name: 'コミュニティ投稿', count: communityCount },
    { name: '質問（知恵袋）', count: questionCount },
    { name: 'うち解決済み', count: resolvedQuestionCount },
    { name: 'チャットメッセージ', count: chatCount },
    { name: '不具合報告', count: bugAgg.reduce((s, g) => s + g._count._all, 0) },
  ]

  const response: AnalyticsResponse = {
    meta: buildMeta(params, notes),
    kpis: {
      inquiries: { value: inquiries.length, compareValue: null },
      formSubmissions: { value: formTotal, compareValue: null },
      lineFriends: { value: lineUserTotal, compareValue: null },
      lineLinkRate: { value: lineUserTotal > 0 ? lineUserLinked / lineUserTotal : 0, compareValue: null },
      lineMessages: { value: lineInCount + lineOutCount, compareValue: null },
      logins: { value: loginCount, compareValue: null },
      announcementReadRate: { value: announcementReadRate, compareValue: null },
      trainingPlays: { value: trainingPlayTotal._sum.playCount ?? 0, compareValue: null },
    },
    series: { inquirySeries, lineSeries, accessSeries },
    breakdowns: { formTop, bugReports, communityActivity },
    tables: {
      leadSourceEffect,
      heatmap: heatmap.map((row, weekday) => ({ weekday, values: row })) as unknown as Record<string, unknown>[],
    },
  }
  return NextResponse.json(response)
}
