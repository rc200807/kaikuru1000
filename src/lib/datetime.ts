// 日時表記は日本時間（Asia/Tokyo）で統一する。
// サーバー（Vercel）は UTC で動作するため、サーバー側で日時を整形する箇所では
// 必ずタイムゾーンを Asia/Tokyo に指定する必要がある（未指定だと UTC 表記になる）。

export const TOKYO_TZ = 'Asia/Tokyo'

type DateInput = Date | string | number

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input)
}

/** 日本時間で「YYYY年M月D日 HH:MM」等に整形（既定は年月日＋時分）。 */
export function formatJstDateTime(input: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(input).toLocaleString('ja-JP', {
    timeZone: TOKYO_TZ,
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    ...opts,
  })
}

/** 日本時間で「YYYY年M月D日」等に整形（既定は年月日）。 */
export function formatJstDate(input: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(input).toLocaleDateString('ja-JP', {
    timeZone: TOKYO_TZ,
    year: 'numeric', month: 'long', day: 'numeric',
    ...opts,
  })
}

/** 日本時間基準の "yyyy-MM-dd"（集計キー等に使用。en-CA は ISO 形式を返す）。 */
export function jstDateKey(input: DateInput): string {
  return toDate(input).toLocaleDateString('en-CA', { timeZone: TOKYO_TZ })
}

/** 日本時間基準の "yyyy-MM"（月次集計キー）。 */
export function jstMonthKey(input: DateInput): string {
  return jstDateKey(input).slice(0, 7)
}
