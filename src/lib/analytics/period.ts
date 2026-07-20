// 分析画面の期間・粒度ユーティリティ（クライアント/サーバー共用）。
// すべての日付境界は JST（Asia/Tokyo）。サーバーは UTC で動作するため、
// "yyyy-MM-dd" の JST 日付文字列を正とし、Date への変換は必ず +09:00 オフセット付きで行う。
import { jstDateKey, jstMonthKey } from '@/lib/datetime'

export const PRESETS = ['today', '7d', '30d', 'this_month', 'last_month', 'this_year', 'all', 'custom'] as const
export type PresetKey = typeof PRESETS[number]

export const PRESET_LABEL: Record<PresetKey, string> = {
  today: '今日',
  '7d': '過去7日',
  '30d': '過去30日',
  this_month: '当月',
  last_month: '前月',
  this_year: '今年',
  all: '全期間',
  custom: 'カスタム',
}

export type CompareMode = 'prev' | 'year' | 'none'
export const COMPARE_LABEL: Record<CompareMode, string> = {
  prev: '前の期間と比較',
  year: '前年同期と比較',
  none: '比較なし',
}

export type Granularity = 'day' | 'week' | 'month'
export const GRANULARITY_LABEL: Record<Granularity, string> = { day: '日', week: '週', month: '月' }

/** from は含む・to は含まない（排他上限）の JST 範囲 */
export type DateRange = { from: Date; to: Date }

/** "yyyy-MM-dd"（JST日付）→ その日の 00:00 JST の Date */
export function dateFromJstStr(s: string): Date {
  return new Date(`${s}T00:00:00+09:00`)
}

/** "yyyy-MM-dd" に日数を加算した "yyyy-MM-dd" を返す（カレンダー演算は UTC で実施） */
export function addDaysStr(s: string, days: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** "yyyy-MM-dd" に月数を加算し、月初日の "yyyy-MM-dd" を返す */
function addMonthsFirstDayStr(s: string, months: number): string {
  const [y, m] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  return dt.toISOString().slice(0, 10)
}

/** 範囲の日数（少なくとも1） */
export function rangeDays(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000))
}

/**
 * プリセット（+カスタム from/to）を JST の DateRange に解決する。
 * - custom: from/to は "yyyy-MM-dd"（to は含む日として受け、内部で +1 日の排他上限に変換）
 * - all: allStartStr（データ最古日など）を開始日とする
 */
export function resolvePreset(
  preset: PresetKey,
  opts: { from?: string | null; to?: string | null; allStartStr?: string; now?: Date } = {},
): DateRange {
  const now = opts.now ?? new Date()
  const todayStr = jstDateKey(now)
  const tomorrow = dateFromJstStr(addDaysStr(todayStr, 1))
  switch (preset) {
    case 'today':
      return { from: dateFromJstStr(todayStr), to: tomorrow }
    case '7d':
      return { from: dateFromJstStr(addDaysStr(todayStr, -6)), to: tomorrow }
    case '30d':
      return { from: dateFromJstStr(addDaysStr(todayStr, -29)), to: tomorrow }
    case 'this_month':
      return { from: dateFromJstStr(`${jstMonthKey(now)}-01`), to: tomorrow }
    case 'last_month': {
      const thisMonthFirst = `${jstMonthKey(now)}-01`
      return { from: dateFromJstStr(addMonthsFirstDayStr(thisMonthFirst, -1)), to: dateFromJstStr(thisMonthFirst) }
    }
    case 'this_year':
      return { from: dateFromJstStr(`${todayStr.slice(0, 4)}-01-01`), to: tomorrow }
    case 'all':
      return { from: dateFromJstStr(opts.allStartStr ?? '2024-01-01'), to: tomorrow }
    case 'custom': {
      const fromStr = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : addDaysStr(todayStr, -29)
      const toStr = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : todayStr
      return { from: dateFromJstStr(fromStr), to: dateFromJstStr(addDaysStr(toStr, 1)) }
    }
  }
}

/** 比較期間を計算する。prev = 同じ長さだけ直前へ / year = 1年前の同期間 */
export function resolveCompareRange(range: DateRange, mode: CompareMode): DateRange | null {
  if (mode === 'none') return null
  if (mode === 'prev') {
    const spanMs = range.to.getTime() - range.from.getTime()
    return { from: new Date(range.from.getTime() - spanMs), to: new Date(range.to.getTime() - spanMs) }
  }
  // year: JST 日付文字列ベースで 1 年戻す（2/29 は 2/28 に丸め）
  const shiftYear = (d: Date) => {
    const s = jstDateKey(d)
    const [y, m, dd] = s.split('-').map(Number)
    const maxDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate()
    return dateFromJstStr(`${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(dd, maxDay)).padStart(2, '0')}`)
  }
  return { from: shiftYear(range.from), to: shiftYear(range.to) }
}

/** 範囲長に応じた既定粒度（≤31日: 日 / ≤120日: 週 / それ以上: 月） */
export function defaultGranularity(range: DateRange): Granularity {
  const days = rangeDays(range)
  if (days <= 31) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

/** JST基準の週キー（その週の月曜日の "yyyy-MM-dd"） */
export function jstWeekKey(input: Date): string {
  const s = jstDateKey(input)
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const offset = (dt.getUTCDay() + 6) % 7 // 月曜=0
  dt.setUTCDate(dt.getUTCDate() - offset)
  return dt.toISOString().slice(0, 10)
}

/** 粒度に応じたバケットキー（day/week: "yyyy-MM-dd"、month: "yyyy-MM"） */
export function bucketKeyOf(input: Date, granularity: Granularity): string {
  if (granularity === 'day') return jstDateKey(input)
  if (granularity === 'week') return jstWeekKey(input)
  return jstMonthKey(input)
}

export type Bucket = { key: string; label: string }

/** 範囲全体をゼロ埋めバケット列に展開する */
export function buildBuckets(range: DateRange, granularity: Granularity): Bucket[] {
  const buckets: Bucket[] = []
  const endKey = bucketKeyOf(new Date(range.to.getTime() - 1), granularity)
  const multiYear = jstDateKey(range.from).slice(0, 4) !== jstDateKey(new Date(range.to.getTime() - 1)).slice(0, 4)
  if (granularity === 'month') {
    let cur = `${bucketKeyOf(range.from, 'month')}-01`
    for (let i = 0; i < 600; i++) {
      const key = cur.slice(0, 7)
      const [y, m] = key.split('-')
      buckets.push({ key, label: multiYear ? `${y.slice(2)}/${Number(m)}月` : `${Number(m)}月` })
      if (key >= endKey) break
      cur = addMonthsFirstDayStr(cur, 1)
    }
    return buckets
  }
  const step = granularity === 'week' ? 7 : 1
  let cur = bucketKeyOf(range.from, granularity)
  for (let i = 0; i < 1200; i++) {
    const [y, m, d] = cur.split('-')
    const base = `${Number(m)}/${Number(d)}`
    buckets.push({
      key: cur,
      label: (multiYear ? `${y.slice(2)}/${base}` : base) + (granularity === 'week' ? '週' : ''),
    })
    if (cur >= endKey) break
    cur = addDaysStr(cur, step)
  }
  return buckets
}

/**
 * 行データをバケット列へ集計する汎用ヘルパー。
 * valueOf を省略すると件数カウント、指定すると合計値になる。
 */
export function fillSeries<T>(
  buckets: Bucket[],
  rows: T[],
  granularity: Granularity,
  dateOf: (row: T) => Date,
  valueOf?: (row: T) => number,
): number[] {
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const values = new Array(buckets.length).fill(0)
  for (const row of rows) {
    const i = index.get(bucketKeyOf(dateOf(row), granularity))
    if (i !== undefined) values[i] += valueOf ? valueOf(row) : 1
  }
  return values
}
