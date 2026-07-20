import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { buildBuckets, bucketKeyOf } from '@/lib/analytics/period'
import { jstDateKey, TOKYO_TZ } from '@/lib/datetime'
import { CHANNEL_LABEL } from '@/lib/tracking'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveTrackingParams, dateWhere, fetchSessions, referrerDomain, urlToPath, PV_FETCH_CAP,
} from '../../tracking/_lib/common'

export const dynamic = 'force-dynamic'

// アクセス解析タブの概要（GA標準レポート相当）。
// AnalyticsResponse 形で返すことで useAnalyticsData / AiInsightCard / AIチャットをそのまま再利用する。
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range, compare, granularity } = resolveTrackingParams(request)
  const notes: string[] = []

  const [{ sessions, truncated }, pvs, cvEvents] = await Promise.all([
    fetchSessions(range),
    prisma.trackingPageView.findMany({
      where: { occurredAt: dateWhere(range) },
      select: { sessionId: true, path: true, title: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
      take: PV_FETCH_CAP,
    }),
    prisma.trackingEvent.findMany({
      where: { occurredAt: dateWhere(range), isConversion: true },
      select: { type: true, sessionId: true, visitorId: true, occurredAt: true, buttonId: true, storeId: true },
    }),
  ])
  if (truncated) notes.push(`セッションが多いため直近${sessions.length.toLocaleString()}件で集計しています`)

  // ─── KPI ───
  const uu = new Set(sessions.map(s => s.visitorId)).size
  const pvBySession = new Map<string, number>()
  for (const pv of pvs) pvBySession.set(pv.sessionId, (pvBySession.get(pv.sessionId) ?? 0) + 1)
  const bounces = sessions.filter(s => (pvBySession.get(s.id) ?? 0) <= 1).length
  const durations = sessions
    .map(s => (s.lastActivityAt.getTime() - s.startedAt.getTime()) / 1000)
    .filter(d => d >= 0 && d < 6 * 3600)
  const avgSessionSec = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const newSessions = sessions.filter(s => s.isFirstSession).length
  const cvSessions = sessions.filter(s => s.hasConversion).length
  const cvByType = { inquiry_submit: 0, form_submit: 0, button_click: 0 } as Record<string, number>
  for (const e of cvEvents) cvByType[e.type] = (cvByType[e.type] ?? 0) + 1

  // 比較期間（軽量にcountのみ）
  let prevCounts: { sessions: number; pv: number; cv: number; uu: number } | null = null
  if (compare) {
    const [prevSessions, prevPv, prevCv, prevUuGroups] = await Promise.all([
      prisma.trackingSession.count({ where: { startedAt: dateWhere(compare) } }),
      prisma.trackingPageView.count({ where: { occurredAt: dateWhere(compare) } }),
      prisma.trackingEvent.count({ where: { occurredAt: dateWhere(compare), isConversion: true } }),
      prisma.trackingSession.groupBy({ by: ['visitorId'], where: { startedAt: dateWhere(compare) } }),
    ])
    prevCounts = { sessions: prevSessions, pv: prevPv, cv: prevCv, uu: prevUuGroups.length }
  }

  // ─── 時系列 ───
  const buckets = buildBuckets(range, granularity)
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]))
  const seriesData = buckets.map(b => ({ label: b.label, sessions: 0, visitors: 0, pv: 0, cv: 0 }))
  const visitorSetByBucket = new Map<number, Set<string>>()
  for (const s of sessions) {
    const i = bucketIndex.get(bucketKeyOf(s.startedAt, granularity))
    if (i === undefined) continue
    seriesData[i].sessions++
    let set = visitorSetByBucket.get(i)
    if (!set) { set = new Set(); visitorSetByBucket.set(i, set) }
    set.add(s.visitorId)
  }
  for (const [i, set] of visitorSetByBucket) seriesData[i].visitors = set.size
  for (const pv of pvs) {
    const i = bucketIndex.get(bucketKeyOf(pv.occurredAt, granularity))
    if (i !== undefined) seriesData[i].pv++
  }
  for (const e of cvEvents) {
    const i = bucketIndex.get(bucketKeyOf(e.occurredAt, granularity))
    if (i !== undefined) seriesData[i].cv++
  }

  // ─── 内訳 ───
  const countBy = (fn: (s: typeof sessions[number]) => string | null) => {
    const map = new Map<string, number>()
    for (const s of sessions) {
      const key = fn(s) ?? '不明'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }
  const channels = countBy(s => s.channel ? (CHANNEL_LABEL[s.channel] ?? s.channel) : null)
  const devices = countBy(s => s.deviceType)
  const browsers = countBy(s => s.browser).slice(0, 8)
  const osList = countBy(s => s.os).slice(0, 8)
  const regions = countBy(s => s.country === 'JP' ? (s.region ?? '不明') : (s.country ? `海外(${s.country})` : null)).slice(0, 15)
  const cities = countBy(s => s.city ? `${s.region ?? ''} ${s.city}` : null).filter(c => c.name !== '不明').slice(0, 15)
  const referrers = countBy(s => referrerDomain(s.referrer)).filter(r => r.name !== '不明').slice(0, 12)
  const landings = countBy(s => urlToPath(s.entryUrl)).slice(0, 12)

  // 離脱ページ（セッション最後のPV）
  const lastPvBySession = new Map<string, { path: string; title: string | null }>()
  for (const pv of pvs) lastPvBySession.set(pv.sessionId, { path: pv.path, title: pv.title }) // 時系列順なので最後が残る
  const exitMap = new Map<string, number>()
  for (const [, last] of lastPvBySession) exitMap.set(last.title || last.path, (exitMap.get(last.title || last.path) ?? 0) + 1)
  const exits = [...exitMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12)

  // 曜日×時間帯ヒートマップ（セッション開始、JST）
  const hourStart = 0
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TOKYO_TZ, weekday: 'short' })
  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TOKYO_TZ, hour: '2-digit', hour12: false })
  const weekdayIdx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  for (const s of sessions) {
    const wd = weekdayIdx[weekdayFmt.format(s.startedAt)] ?? 0
    const hour = Number(hourFmt.format(s.startedAt)) % 24
    heatmap[wd][hour]++
  }

  // 最新CVフィード
  const recentCv = [...cvEvents].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 10)
  const storeIds = [...new Set(recentCv.map(e => e.storeId).filter((v): v is string => !!v))]
  const buttonIds = [...new Set(recentCv.map(e => e.buttonId).filter((v): v is string => !!v))]
  const [stores, buttons] = await Promise.all([
    storeIds.length ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    buttonIds.length ? prisma.trackingButton.findMany({ where: { id: { in: buttonIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const storeMap = new Map(stores.map(s => [s.id, s.name]))
  const buttonMap = new Map(buttons.map(b => [b.id, b.name]))
  const sessionById = new Map(sessions.map(s => [s.id, s]))
  const cvFeed = recentCv.map(e => {
    const sess = e.sessionId ? sessionById.get(e.sessionId) : null
    return {
      visitorId: e.visitorId,
      type: e.type === 'inquiry_submit' ? '問い合わせ' : e.type === 'form_submit' ? 'フォーム' : `ボタン: ${e.buttonId ? (buttonMap.get(e.buttonId) ?? '') : ''}`,
      store: e.storeId ? (storeMap.get(e.storeId) ?? '—') : '—',
      channel: sess?.channel ? (CHANNEL_LABEL[sess.channel] ?? sess.channel) : '—',
      referrer: sess ? (referrerDomain(sess.referrer) ?? '直接') : '—',
      occurredAt: e.occurredAt.toISOString(),
    }
  })

  const inclusiveEnd = jstDateKey(new Date(range.to.getTime() - 1))
  const response: AnalyticsResponse = {
    meta: {
      range: { from: jstDateKey(range.from), to: inclusiveEnd },
      compareRange: compare ? { from: jstDateKey(compare.from), to: jstDateKey(new Date(compare.to.getTime() - 1)) } : null,
      granularity,
      ...(notes.length > 0 ? { notes } : {}),
    },
    kpis: {
      visitors: { value: uu, compareValue: prevCounts ? prevCounts.uu : null },
      sessions: { value: sessions.length, compareValue: prevCounts ? prevCounts.sessions : null },
      pageviews: { value: pvs.length, compareValue: prevCounts ? prevCounts.pv : null },
      bounceRate: { value: sessions.length > 0 ? bounces / sessions.length : 0, compareValue: null },
      avgSessionSec: { value: avgSessionSec, compareValue: null },
      pvPerSession: { value: sessions.length > 0 ? pvs.length / sessions.length : 0, compareValue: null },
      newRate: { value: sessions.length > 0 ? newSessions / sessions.length : 0, compareValue: null },
      conversions: { value: cvEvents.length, compareValue: prevCounts ? prevCounts.cv : null },
      cvr: { value: sessions.length > 0 ? cvSessions / sessions.length : 0, compareValue: null },
      cvInquiry: { value: cvByType.inquiry_submit ?? 0, compareValue: null },
      cvForm: { value: cvByType.form_submit ?? 0, compareValue: null },
      cvButton: { value: cvByType.button_click ?? 0, compareValue: null },
    },
    series: { traffic: seriesData as unknown as SeriesPoint[] },
    breakdowns: { channels, devices, browsers, os: osList, regions, cities, referrers, landings, exits },
    tables: {
      cvFeed,
      heatmap: heatmap.map((row, weekday) => ({ weekday, values: row })) as unknown as Record<string, unknown>[],
      heatmapMeta: [{ hourStart }],
    },
  }
  return NextResponse.json(response)
}
