// sysadmin 監視系APIの共通集計ヘルパー。
// raw SQL は使わず（SQLite/PostgreSQL 両対応）、日次キーは JST 基準で統一する。

import { jstDateKey, TOKYO_TZ } from '@/lib/datetime'

/** 直近 days 日分の JST 日付キー（"yyyy-MM-dd"）を古い順に返す。 */
export function lastDays(days: number, now: Date = new Date()): string[] {
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    keys.push(jstDateKey(new Date(now.getTime() - i * 86400_000)))
  }
  return keys
}

/**
 * Date 配列を JST 日付キーごとに集計し、直近 days 日を欠損 0 埋めで返す。
 * 使い方: findMany({ select: { createdAt: true }, where: { createdAt: { gte: since } } }) の結果を渡す。
 */
export function aggregateDaily(dates: Date[], days: number, now: Date = new Date()): { date: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const d of dates) {
    const key = jstDateKey(d)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return lastDays(days, now).map(date => ({ date, count: counts.get(date) ?? 0 }))
}

/** 直近 days 日ぶんの集計開始時刻（now - days*24h）。 */
export function sinceDays(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86400_000)
}

/** 直近 hours 時間ぶんの集計開始時刻。 */
export function sinceHours(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - hours * 3600_000)
}

/** JST の「今日の0時」を UTC Date で返す（今後の予定件数などの境界に使用）。 */
export function jstStartOfToday(now: Date = new Date()): Date {
  const key = jstDateKey(now) // yyyy-MM-dd（JST）
  // JST は UTC+9 固定（DSTなし）
  return new Date(`${key}T00:00:00+09:00`)
}

export { TOKYO_TZ }
