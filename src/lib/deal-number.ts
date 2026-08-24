/**
 * 案件番号（例: 20260824001）の表記ルール。
 * 「案件発生日（JST）の yyyyMMdd」＋「その日の連番3桁」。1日1000件を超えたら4桁に伸びる。
 * 一度採番したら変更しない（案件発生日を後から直しても番号は据え置き）。
 * 注意: DBアクセスは deal-number-server.ts。ここはクライアントからも import されるので prisma を持ち込まないこと
 */

/** JST基準の "yyyyMMdd" */
export function dealNumberPrefix(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '')
}

/** 連番の桁数（下限。超えたら自然に桁が伸びる） */
export const DEAL_NUMBER_SEQ_DIGITS = 3

/** prefix + 連番 → 案件番号 */
export function buildDealNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(DEAL_NUMBER_SEQ_DIGITS, '0')}`
}

/** 表示用の整形（未採番は「未採番」） */
export function formatDealNumber(dealNumber: string | null | undefined): string {
  return dealNumber?.trim() || '未採番'
}

/** 案件番号らしい文字列か（検索を番号一致に回すかの判定に使う） */
export function looksLikeDealNumber(value: string): boolean {
  return /^\d{8,}$/.test(value.trim())
}
