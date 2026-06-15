/**
 * 案件（Deal）ステータスの中央定義。
 * 表示ラベル、UIカラー、検証、自動遷移の集約点。
 * パイプライン: お問い合わせ → 訪問決定 → 見積のみ → 契約 → 完了
 * 終端（失注）: 訪問失注 / 未訪問失注
 */

export const DEAL_STATUSES = [
  'inquiry',          // お問い合わせ
  'visit_decided',    // 訪問決定
  'estimate_only',    // 見積のみ
  'contract',         // 契約
  'completed',        // 完了
  'lost_after_visit', // 訪問失注
  'lost_no_visit',    // 未訪問失注
] as const
export type DealStatus = typeof DEAL_STATUSES[number]

/** UI で並べる順（パイプライン順、終端は末尾） */
export const DEAL_STATUS_ORDER: DealStatus[] = [...DEAL_STATUSES]

// Record<string, ...> にして、旧 'lost' などの過去データも表示できるようにする
export const DEAL_STATUS_LABEL: Record<string, string> = {
  inquiry:          'お問い合わせ',
  visit_decided:    '訪問決定',
  estimate_only:    '見積のみ',
  contract:         '契約',
  completed:        '完了',
  lost_after_visit: '訪問失注',
  lost_no_visit:    '未訪問失注',
  lost:             '失注', // 旧データ後方互換
}

/** UI バッジ用カラー（CUSTOMER_TYPE_BADGE と同じ {bg,fg} 形式） */
export const DEAL_STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  inquiry:          { bg: 'rgba(96,165,250,0.15)',  fg: '#60a5fa' },
  visit_decided:    { bg: 'rgba(168,139,250,0.15)', fg: '#a78bfa' },
  estimate_only:    { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  contract:         { bg: 'rgba(45,212,191,0.15)',  fg: '#2dd4bf' },
  completed:        { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  lost_after_visit: { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  lost_no_visit:    { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  lost:             { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' }, // 旧データ後方互換
}

/** 文字列が有効な DealStatus か判定 */
export function isDealStatus(v: string | null | undefined): v is DealStatus {
  return typeof v === 'string' && (DEAL_STATUSES as readonly string[]).includes(v)
}

/**
 * 自動遷移の許可元ステータス。
 * イベント（訪問予定作成/見積発行/契約発行）でステータスを「前進」させる際、
 * 現在ステータスが下記のいずれかのときのみ書き換える（前進のみ・終端は変更しない）。
 */
export const DEAL_AUTO_ADVANCE_FROM: Record<'visit_decided' | 'estimate_only' | 'contract', DealStatus[]> = {
  visit_decided: ['inquiry'],
  estimate_only: ['inquiry', 'visit_decided'],
  contract:      ['inquiry', 'visit_decided', 'estimate_only'],
}
