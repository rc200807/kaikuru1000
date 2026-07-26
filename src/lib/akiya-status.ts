/**
 * 空き家管理案件のステータス中央定義。
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */
export const AKIYA_STATUSES = ['pre_contract', 'contracting', 'contracted', 'cancelled'] as const
export type AkiyaStatus = typeof AKIYA_STATUSES[number]

export const AKIYA_STATUS_LABEL: Record<string, string> = {
  pre_contract: '契約前',
  contracting:  '契約作業中',
  contracted:   '契約',
  cancelled:    '解約',
}

export const AKIYA_STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  pre_contract: { bg: 'rgba(148,163,184,0.18)', fg: '#64748b' },
  contracting:  { bg: 'rgba(251,191,36,0.15)',  fg: '#b45309' },
  contracted:   { bg: 'rgba(34,197,94,0.15)',   fg: '#16a34a' },
  cancelled:    { bg: 'rgba(239,68,68,0.12)',   fg: '#dc2626' },
}

export const AKIYA_STATUS_OPTIONS = AKIYA_STATUSES.map(value => ({
  value, label: AKIYA_STATUS_LABEL[value],
}))

export function isAkiyaStatus(v: unknown): v is AkiyaStatus {
  return typeof v === 'string' && (AKIYA_STATUSES as readonly string[]).includes(v)
}

export function akiyaStatusLabel(value: string | null | undefined): string {
  return (value && AKIYA_STATUS_LABEL[value]) || AKIYA_STATUS_LABEL.pre_contract
}
