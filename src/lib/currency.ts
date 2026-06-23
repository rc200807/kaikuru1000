// 円表記の共通フォーマッタ。null/未定義/NaN は '-' を返す。
export const formatYen = (n?: number | null): string => {
  if (n == null || isNaN(Number(n))) return '-'
  return `¥${Number(n).toLocaleString('ja-JP')}`
}
