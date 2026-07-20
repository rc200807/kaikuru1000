// 分析画面の表示フォーマッタ（クライアント用）

export function fmtYen(n: number): string {
  if (Math.abs(n) >= 100_000_000) return `¥${(n / 100_000_000).toFixed(1)}億`
  if (Math.abs(n) >= 10_000) return `¥${Math.round(n / 10_000).toLocaleString()}万`
  return `¥${Math.round(n).toLocaleString()}`
}

export function fmtYenFull(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString()
}

export function fmtPct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

/** 軸目盛り用の短縮表記 */
export function fmtAxis(n: number): string {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000)}万`
  return String(n)
}
