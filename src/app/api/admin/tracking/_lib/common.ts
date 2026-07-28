// アクセス計測 管理APIの共通ヘルパー
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  PRESETS, PresetKey, DateRange, resolvePreset, resolveCompareRange, defaultGranularity, Granularity,
} from '@/lib/analytics/period'

export type TrackingParams = {
  preset: PresetKey
  range: DateRange
  compare: DateRange | null
  granularity: Granularity
}

/** 分析画面と同じクエリパラメータ（preset/from/to/compare/granularity）を解決 */
export function resolveTrackingParams(request: NextRequest): TrackingParams {
  const sp = request.nextUrl.searchParams
  const presetRaw = sp.get('preset')
  const preset: PresetKey = (PRESETS as readonly string[]).includes(presetRaw ?? '') ? (presetRaw as PresetKey) : '30d'
  const range = resolvePreset(preset, { from: sp.get('from'), to: sp.get('to') })
  const compareRaw = sp.get('compare')
  const compare = preset === 'all' || compareRaw === 'none'
    ? null
    : resolveCompareRange(range, compareRaw === 'year' ? 'year' : 'prev')
  const granularityRaw = sp.get('granularity')
  const granularity: Granularity =
    granularityRaw === 'day' || granularityRaw === 'week' || granularityRaw === 'month'
      ? granularityRaw
      : defaultGranularity(range)
  return { preset, range, compare, granularity }
}

export function dateWhere(range: DateRange) {
  return { gte: range.from, lt: range.to }
}

export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/** referrer URL → ドメイン */
export function referrerDomain(referrer: string | null): string | null {
  if (!referrer) return null
  try { return new URL(referrer).hostname } catch { return null }
}

/** URL → ホスト+パス（クエリ除去） */
export function urlToPath(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch { return null }
}

/** セッション取得上限（大量データ対策） */
export const SESSION_FETCH_CAP = 20_000
export const PV_FETCH_CAP = 50_000
export const FLOW_SESSION_CAP = 5_000

// 概要タブ用の上限。生行の取り込みは「時刻列だけ」「直近サンプルだけ」に限定し、
// 件数系は DB 側 count/groupBy で求めることで件数に依存しない応答時間にする。
/** 時系列・ヒートマップ用に取り込むセッション数の上限（時刻＋訪問者IDのみ） */
export const SESSION_TS_CAP = 200_000
/** 参照元・LP・離脱ページのサンプル対象セッション数 */
export const SAMPLE_SESSION_CAP = 3_000
/** サンプルセッションのPV取得上限（暴走セッション対策のバックストップ） */
export const SAMPLE_PV_CAP = 60_000
/** 直帰率算出（sessionId 別PV件数）の groupBy 上限 */
export const PV_GROUP_CAP = 150_000
/** CVイベント取得上限 */
export const EVENT_FETCH_CAP = 20_000

/** 同時実行数を絞って並列実行する（バケット単位のcountクエリ用） */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export type SessionLite = {
  id: string
  visitorId: string
  startedAt: Date
  lastActivityAt: Date
  channel: string | null
  deviceType: string | null
  browser: string | null
  os: string | null
  country: string | null
  region: string | null
  city: string | null
  referrer: string | null
  entryUrl: string
  entryTitle: string | null
  entryParams: string
  isFirstSession: boolean
  hasConversion: boolean
}

export async function fetchSessions(range: DateRange, cap = SESSION_FETCH_CAP): Promise<{ sessions: SessionLite[]; truncated: boolean }> {
  const sessions = await prisma.trackingSession.findMany({
    where: { startedAt: dateWhere(range) },
    select: {
      id: true, visitorId: true, startedAt: true, lastActivityAt: true, channel: true,
      deviceType: true, browser: true, os: true, country: true, region: true, city: true,
      referrer: true, entryUrl: true, entryTitle: true, entryParams: true, isFirstSession: true, hasConversion: true,
    },
    orderBy: { startedAt: 'desc' },
    take: cap + 1,
  })
  const truncated = sessions.length > cap
  return { sessions: truncated ? sessions.slice(0, cap) : sessions, truncated }
}

/** 複数セッションのPVを取得（sessionIdごとに時系列） */
export async function fetchPageViewsBySessions(sessionIds: string[], cap = PV_FETCH_CAP) {
  if (sessionIds.length === 0) return []
  // Prisma の in は大量IDでも動くが、念のため分割
  const chunks: string[][] = []
  for (let i = 0; i < sessionIds.length; i += 2000) chunks.push(sessionIds.slice(i, i + 2000))
  const all: { sessionId: string; path: string; title: string | null; occurredAt: Date; durationSec: number | null; scrollDepth: number | null }[] = []
  for (const chunk of chunks) {
    if (all.length >= cap) break
    const rows = await prisma.trackingPageView.findMany({
      where: { sessionId: { in: chunk } },
      select: { sessionId: true, path: true, title: true, occurredAt: true, durationSec: true, scrollDepth: true },
      orderBy: { occurredAt: 'asc' },
      take: cap - all.length,
    })
    all.push(...rows)
  }
  return all
}
