import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import {
  buildBuckets, bucketKeyOf, bucketDateRange, dateFromJstStr, addDaysStr, GRANULARITY_LABEL,
  type Granularity, type DateRange,
} from '@/lib/analytics/period'
import { jstDateKey, TOKYO_TZ } from '@/lib/datetime'
import { CHANNEL_LABEL } from '@/lib/tracking'
import type { AnalyticsResponse, SeriesPoint } from '@/lib/analytics/types'
import {
  resolveTrackingParams, dateWhere, referrerDomain, urlToPath,
  SAMPLE_SESSION_CAP, SAMPLE_PV_CAP, SESSION_TS_CAP, PV_GROUP_CAP, EVENT_FETCH_CAP, mapLimit,
} from '../../tracking/_lib/common'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// バケット数の上限。これを超える場合は粒度を粗くする（1バケット=1クエリのため）
const MAX_BUCKETS = 62

/** バケットキー → 実クエリ範囲（選択期間からはみ出す週/月の端は切り詰める） */
function bucketWhere(key: string, granularity: Granularity, range: DateRange) {
  const { from, to } = bucketDateRange(key, granularity)
  const start = dateFromJstStr(from)
  const end = dateFromJstStr(addDaysStr(to, 1))
  return { gte: start < range.from ? range.from : start, lt: end > range.to ? range.to : end }
}

// アクセス解析タブの概要（GA標準レポート相当）。
// AnalyticsResponse 形で返すことで useAnalyticsData / AiInsightCard / AIチャットをそのまま再利用する。
//
// 【集計方針】生データを JS に持ってくると件数に比例してメモリと時間が増え、
// 実際に本番で OOM（instance ran out of memory）していたため、
// 件数系はすべて DB 側の count / groupBy で求め、JS に取り込む行は
//  - セッションの時刻列のみ（時系列・ヒートマップ・平均滞在に必要）
//  - 直近 N セッションのサンプル（参照元・LP・離脱ページに必要）
// に限定している。
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range, compare, granularity: requestedGranularity } = resolveTrackingParams(request)
  const notes: string[] = []

  // 粒度が細かすぎるとバケット数＝クエリ数が爆発するので粗く丸める
  let granularity = requestedGranularity
  let buckets = buildBuckets(range, granularity)
  if (buckets.length > MAX_BUCKETS && granularity === 'day') {
    granularity = 'week'
    buckets = buildBuckets(range, granularity)
  }
  if (buckets.length > MAX_BUCKETS && granularity === 'week') {
    granularity = 'month'
    buckets = buildBuckets(range, granularity)
  }
  if (granularity !== requestedGranularity) {
    notes.push(`期間が長いため粒度を「${GRANULARITY_LABEL[granularity]}」に丸めて集計しています`)
  }

  const sessionWhere = { startedAt: dateWhere(range) }
  const pvWhere = { occurredAt: dateWhere(range) }
  const cvWhere = { occurredAt: dateWhere(range), isConversion: true }

  const [
    sessionRows,
    sessionCount, newSessionCount, cvSessionCount, visitorCount,
    cvCount, cvTypeGroups, cvEvents,
    channelGroups, deviceGroups, browserGroups, osGroups, regionGroups, cityGroups,
    pvByBucket, pvSessionGroups, sampleSessions,
  ] = await Promise.all([
    // 時系列・ヒートマップ・平均セッション時間用（時刻＋訪問者IDのみの軽量取得）
    prisma.trackingSession.findMany({
      where: sessionWhere,
      select: { startedAt: true, lastActivityAt: true, visitorId: true },
      orderBy: { startedAt: 'desc' },
      take: SESSION_TS_CAP + 1,
    }),
    prisma.trackingSession.count({ where: sessionWhere }),
    prisma.trackingSession.count({ where: { ...sessionWhere, isFirstSession: true } }),
    prisma.trackingSession.count({ where: { ...sessionWhere, hasConversion: true } }),
    // UU は訪問者テーブル側の EXISTS で数える（visitorId を全件持ってこない）
    prisma.trackingVisitor.count({ where: { sessions: { some: sessionWhere } } }),
    prisma.trackingEvent.count({ where: cvWhere }),
    prisma.trackingEvent.groupBy({ by: ['type'], where: cvWhere, _count: { _all: true } }),
    // CVイベントは件数が少ないので行取得（時系列＋最新フィードに使用）
    prisma.trackingEvent.findMany({
      where: cvWhere,
      select: { type: true, sessionId: true, visitorId: true, occurredAt: true, buttonId: true, storeId: true },
      orderBy: { occurredAt: 'desc' },
      take: EVENT_FETCH_CAP + 1,
    }),
    prisma.trackingSession.groupBy({ by: ['channel'], where: sessionWhere, _count: { _all: true } }),
    prisma.trackingSession.groupBy({ by: ['deviceType'], where: sessionWhere, _count: { _all: true } }),
    prisma.trackingSession.groupBy({ by: ['browser'], where: sessionWhere, _count: { _all: true } }),
    prisma.trackingSession.groupBy({ by: ['os'], where: sessionWhere, _count: { _all: true } }),
    prisma.trackingSession.groupBy({ by: ['country', 'region'], where: sessionWhere, _count: { _all: true } }),
    prisma.trackingSession.groupBy({ by: ['region', 'city'], where: sessionWhere, _count: { _all: true } }),
    // PV はバケットごとに DB 側で count（行は 1 件も JS に持ってこない）
    mapLimit(buckets, 8, b => prisma.trackingPageView.count({ where: { occurredAt: bucketWhere(b.key, granularity, range) } })),
    // 直帰率用：セッションごとの PV 件数。多い順に取るので「2PV以上のセッション数」は
    // 上限に達しない限り厳密に求まる。
    prisma.trackingPageView.groupBy({
      by: ['sessionId'],
      where: pvWhere,
      _count: { sessionId: true },
      orderBy: { _count: { sessionId: 'desc' } },
      take: PV_GROUP_CAP,
    }),
    // 参照元・ランディング・離脱ページ用のサンプル（URL は TEXT で重いため直近分のみ）
    prisma.trackingSession.findMany({
      where: sessionWhere,
      select: { id: true, referrer: true, entryUrl: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
      take: SAMPLE_SESSION_CAP,
    }),
  ])

  const sessionsTruncated = sessionRows.length > SESSION_TS_CAP
  const tsRows = sessionsTruncated ? sessionRows.slice(0, SESSION_TS_CAP) : sessionRows
  if (sessionsTruncated) {
    notes.push(`セッションが多いため推移・ヒートマップ・平均滞在は直近${SESSION_TS_CAP.toLocaleString()}件で集計しています`)
  }
  const cvTruncated = cvEvents.length > EVENT_FETCH_CAP
  const cvRows = cvTruncated ? cvEvents.slice(0, EVENT_FETCH_CAP) : cvEvents
  if (cvTruncated) {
    notes.push(`CVが多いためCV推移は直近${EVENT_FETCH_CAP.toLocaleString()}件で集計しています`)
  }
  if (sessionCount > SAMPLE_SESSION_CAP) {
    notes.push(`参照元・ランディング・離脱ページは直近${SAMPLE_SESSION_CAP.toLocaleString()}セッションのサンプル集計です`)
  }

  // ─── KPI ───
  const pvCount = pvByBucket.reduce((a, b) => a + b, 0)
  const multiPvSessions = pvSessionGroups.filter(g => g._count.sessionId > 1).length
  const bounces = Math.max(0, sessionCount - multiPvSessions)
  if (pvSessionGroups.length >= PV_GROUP_CAP) notes.push('直帰率は上限件数に達したため概算値です')

  const durations = tsRows
    .map(s => (s.lastActivityAt.getTime() - s.startedAt.getTime()) / 1000)
    .filter(d => d >= 0 && d < 6 * 3600)
  const avgSessionSec = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const cvByType = { inquiry_submit: 0, form_submit: 0, button_click: 0 } as Record<string, number>
  for (const g of cvTypeGroups) cvByType[g.type] = g._count._all

  // 比較期間（軽量にcountのみ）
  let prevCounts: { sessions: number; pv: number; cv: number; uu: number } | null = null
  if (compare) {
    const prevSessionWhere = { startedAt: dateWhere(compare) }
    const [prevSessions, prevPv, prevCv, prevUu] = await Promise.all([
      prisma.trackingSession.count({ where: prevSessionWhere }),
      prisma.trackingPageView.count({ where: { occurredAt: dateWhere(compare) } }),
      prisma.trackingEvent.count({ where: { occurredAt: dateWhere(compare), isConversion: true } }),
      prisma.trackingVisitor.count({ where: { sessions: { some: prevSessionWhere } } }),
    ])
    prevCounts = { sessions: prevSessions, pv: prevPv, cv: prevCv, uu: prevUu }
  }

  // ─── 時系列 ───
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]))
  const seriesData = buckets.map((b, i) => ({ label: b.label, sessions: 0, visitors: 0, pv: pvByBucket[i] ?? 0, cv: 0 }))
  const visitorSetByBucket = new Map<number, Set<string>>()
  for (const s of tsRows) {
    const i = bucketIndex.get(bucketKeyOf(s.startedAt, granularity))
    if (i === undefined) continue
    seriesData[i].sessions++
    let set = visitorSetByBucket.get(i)
    if (!set) { set = new Set(); visitorSetByBucket.set(i, set) }
    set.add(s.visitorId)
  }
  for (const [i, set] of visitorSetByBucket) seriesData[i].visitors = set.size
  for (const e of cvRows) {
    const i = bucketIndex.get(bucketKeyOf(e.occurredAt, granularity))
    if (i !== undefined) seriesData[i].cv++
  }

  // ─── 内訳（DB側 groupBy の結果を表示ラベルへ畳み込む） ───
  const toRanking = (rows: { name: string | null; count: number }[]) => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const key = r.name ?? '不明'
      map.set(key, (map.get(key) ?? 0) + r.count)
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }
  const channels = toRanking(channelGroups.map(g => ({
    name: g.channel ? (CHANNEL_LABEL[g.channel] ?? g.channel) : null,
    count: g._count._all,
  })))
  const devices = toRanking(deviceGroups.map(g => ({ name: g.deviceType, count: g._count._all })))
  const browsers = toRanking(browserGroups.map(g => ({ name: g.browser, count: g._count._all }))).slice(0, 8)
  const osList = toRanking(osGroups.map(g => ({ name: g.os, count: g._count._all }))).slice(0, 8)
  const regions = toRanking(regionGroups.map(g => ({
    name: g.country === 'JP' ? (g.region ?? '不明') : (g.country ? `海外(${g.country})` : null),
    count: g._count._all,
  }))).slice(0, 15)
  const cities = toRanking(cityGroups.map(g => ({
    name: g.city ? `${g.region ?? ''} ${g.city}` : null,
    count: g._count._all,
  }))).filter(c => c.name !== '不明').slice(0, 15)

  // 参照元・ランディング（サンプル）
  const referrers = toRanking(sampleSessions.map(s => ({ name: referrerDomain(s.referrer), count: 1 })))
    .filter(r => r.name !== '不明').slice(0, 12)
  const landings = toRanking(sampleSessions.map(s => ({ name: urlToPath(s.entryUrl), count: 1 }))).slice(0, 12)

  // 離脱ページ（サンプルセッションの最後のPV）
  const samplePvs = sampleSessions.length > 0
    ? await prisma.trackingPageView.findMany({
        where: { sessionId: { in: sampleSessions.map(s => s.id) } },
        // occurredAt は orderBy に使うので select にも含める（未選択カラムでの並べ替えは Prisma が panic する）
        select: { sessionId: true, path: true, title: true, occurredAt: true },
        orderBy: { occurredAt: 'asc' },
        take: SAMPLE_PV_CAP,
      })
    : []
  const lastPvBySession = new Map<string, { path: string; title: string | null }>()
  for (const pv of samplePvs) lastPvBySession.set(pv.sessionId, { path: pv.path, title: pv.title }) // 時系列順なので最後が残る
  const exitMap = new Map<string, number>()
  for (const [, last] of lastPvBySession) exitMap.set(last.title || last.path, (exitMap.get(last.title || last.path) ?? 0) + 1)
  const exits = [...exitMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12)

  // 曜日×時間帯ヒートマップ（セッション開始、JST）
  const hourStart = 0
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TOKYO_TZ, weekday: 'short' })
  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TOKYO_TZ, hour: '2-digit', hour12: false })
  const weekdayIdx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  for (const s of tsRows) {
    const wd = weekdayIdx[weekdayFmt.format(s.startedAt)] ?? 0
    const hour = Number(hourFmt.format(s.startedAt)) % 24
    heatmap[wd][hour]++
  }

  // 最新CVフィード（cvRows は occurredAt 降順）
  const recentCv = cvRows.slice(0, 10)
  const storeIds = [...new Set(recentCv.map(e => e.storeId).filter((v): v is string => !!v))]
  const buttonIds = [...new Set(recentCv.map(e => e.buttonId).filter((v): v is string => !!v))]
  const sessionIds = [...new Set(recentCv.map(e => e.sessionId).filter((v): v is string => !!v))]
  const [stores, buttons, cvSessions] = await Promise.all([
    storeIds.length ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    buttonIds.length ? prisma.trackingButton.findMany({ where: { id: { in: buttonIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sessionIds.length ? prisma.trackingSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, channel: true, referrer: true } }) : Promise.resolve([]),
  ])
  const storeMap = new Map(stores.map(s => [s.id, s.name]))
  const buttonMap = new Map(buttons.map(b => [b.id, b.name]))
  const sessionById = new Map(cvSessions.map(s => [s.id, s]))
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
      visitors: { value: visitorCount, compareValue: prevCounts ? prevCounts.uu : null },
      sessions: { value: sessionCount, compareValue: prevCounts ? prevCounts.sessions : null },
      pageviews: { value: pvCount, compareValue: prevCounts ? prevCounts.pv : null },
      bounceRate: { value: sessionCount > 0 ? bounces / sessionCount : 0, compareValue: null },
      avgSessionSec: { value: avgSessionSec, compareValue: null },
      pvPerSession: { value: sessionCount > 0 ? pvCount / sessionCount : 0, compareValue: null },
      newRate: { value: sessionCount > 0 ? newSessionCount / sessionCount : 0, compareValue: null },
      conversions: { value: cvCount, compareValue: prevCounts ? prevCounts.cv : null },
      cvr: { value: sessionCount > 0 ? cvSessionCount / sessionCount : 0, compareValue: null },
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
