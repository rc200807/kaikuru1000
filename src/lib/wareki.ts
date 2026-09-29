// 和暦変換（Prisma非依存の純関数。client/server両方から利用可）
// 身分証（運転免許証など）は和暦で書かれているが、システムには西暦（YYYY-MM-DD）で保存している。
// 契約書・台帳では和暦も併記したいので、西暦の日付から和暦テキストを導出する。

// 新しい元号から順に並べる。start は各元号の初日（西暦・ローカル日付）
const ERAS: { name: string; start: [number, number, number] }[] = [
  { name: '令和', start: [2019, 5, 1] },
  { name: '平成', start: [1989, 1, 8] },
  { name: '昭和', start: [1926, 12, 25] },
  { name: '大正', start: [1912, 7, 30] },
  { name: '明治', start: [1868, 1, 25] },
]

function ymdKey(y: number, m: number, d: number): number {
  return y * 10000 + m * 100 + d
}

/** 西暦の年月日を和暦テキスト（例: 平成12年1月23日 / 令和元年5月1日）にする。明治より前・不正日付は null */
export function toWareki(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // 実在しない日付（2月30日など）を弾く
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null

  const key = ymdKey(year, month, day)
  const era = ERAS.find(e => key >= ymdKey(...e.start))
  if (!era) return null
  const eraYear = year - era.start[0] + 1
  return `${era.name}${eraYear === 1 ? '元' : eraYear}年${month}月${day}日`
}

/**
 * "YYYY-MM-DD"（"/" 区切りや "YYYY年M月D日" も可）を和暦テキストにする。
 * 解析できない値（すでに和暦のテキストなど）は null。
 */
export function warekiFromDateString(value: string | null | undefined): string | null {
  const m = /^\s*(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?\s*$/.exec(value ?? '')
  if (!m) return null
  return toWareki(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** 表示用: 西暦の日付文字列に和暦を併記する（"2000-01-23" → "2000-01-23（平成12年1月23日）"）。解析できなければそのまま */
export function withWareki(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  const w = warekiFromDateString(v)
  return w ? `${v}（${w}）` : v
}
