/**
 * 案件（Deal）ステータスの中央定義。
 * 表示ラベル、UIカラー、検証の集約点。
 * パイプライン: 問い合わせ → 訪問決定 → 見積のみ → 契約 ＋ 終端（完了 / 失注）
 */

export const DEAL_STATUSES = [
  'inquiry',
  'visit_decided',
  'estimate_only',
  'contract',
  'completed',
  'lost',
] as const
export type DealStatus = typeof DEAL_STATUSES[number]

/** UI で並べる順（パイプライン順、終端は末尾） */
export const DEAL_STATUS_ORDER: DealStatus[] = [...DEAL_STATUSES]

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  inquiry:       '問い合わせ',
  visit_decided: '訪問決定',
  estimate_only: '見積のみ',
  contract:      '契約',
  completed:     '完了',
  lost:          '失注',
}

/** UI バッジ用カラー（CUSTOMER_TYPE_BADGE と同じ {bg,fg} 形式） */
export const DEAL_STATUS_BADGE: Record<DealStatus, { bg: string; fg: string }> = {
  inquiry:       { bg: 'rgba(96,165,250,0.15)',  fg: '#60a5fa' },
  visit_decided: { bg: 'rgba(168,139,250,0.15)', fg: '#a78bfa' },
  estimate_only: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  contract:      { bg: 'rgba(45,212,191,0.15)',  fg: '#2dd4bf' },
  completed:     { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  lost:          { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
}

/** 文字列が有効な DealStatus か判定 */
export function isDealStatus(v: string | null | undefined): v is DealStatus {
  return typeof v === 'string' && (DEAL_STATUSES as readonly string[]).includes(v)
}
