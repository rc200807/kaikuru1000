// クレーム対応の中央定義（選択肢・ラベル・日付の扱い）。
// 'use client' を付けずサーバー／クライアント両方から参照する。

/** 状況・結果 */
export const COMPLAINT_STATUSES = [
  { value: 'resolved',    label: '解決済み' },
  { value: 'in_progress', label: '対応中' },
  { value: 'unresolved',  label: '未解決' },
] as const
export type ComplaintStatus = typeof COMPLAINT_STATUSES[number]['value']

export const COMPLAINT_STATUS_VALUES = COMPLAINT_STATUSES.map(s => s.value) as readonly string[]

export function complaintStatusLabel(value: string | null | undefined): string {
  return COMPLAINT_STATUSES.find(s => s.value === value)?.label ?? (value ?? '')
}

/** 状況バッジの配色（他画面のステータス表示と同じトーン） */
export const COMPLAINT_STATUS_COLOR: Record<ComplaintStatus, { bg: string; fg: string }> = {
  resolved:    { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
  in_progress: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  unresolved:  { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
}

/** 直営 or 加盟店 */
export const STORE_OWNERSHIPS = [
  { value: 'direct',    label: '直営' },
  { value: 'franchise', label: '加盟店' },
] as const
export type StoreOwnership = typeof STORE_OWNERSHIPS[number]['value']

export const STORE_OWNERSHIP_VALUES = STORE_OWNERSHIPS.map(o => o.value) as readonly string[]

export function storeOwnershipLabel(value: string | null | undefined): string {
  return STORE_OWNERSHIPS.find(o => o.value === value)?.label ?? (value ?? '')
}

/** 対応者の役割（フォーム・一覧の並び順の単一ソース） */
export const COMPLAINT_HANDLER_ROLES = [
  { key: 'primaryHandlerId',   label: '一次対応者' },
  { key: 'secondaryHandlerId', label: '二次対応者' },
  { key: 'finalHandlerId',     label: '最終対応者' },
] as const
export type ComplaintHandlerKey = typeof COMPLAINT_HANDLER_ROLES[number]['key']

// ── 発生日の扱い ──────────────────────────────────────────────
// 発生日は時刻を持たない暦日。ローカルタイムで解釈すると保存・表示のたびに
// 前後の日へずれるため、UTC 0時に固定して保存し、取り出しも UTC で行う。

/** "YYYY-MM-DD" → UTC 0時の Date。不正な文字列は null */
export function parseOccurredOn(input: unknown): Date | null {
  if (typeof input !== 'string') return null
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

/** Date → "YYYY-MM-DD"（UTC基準。input[type=date] にそのまま渡せる） */
export function formatOccurredOn(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 一覧表示用の和文日付（例: 2026/07/31） */
export function formatOccurredOnJa(date: Date | string | null | undefined): string {
  const ymd = formatOccurredOn(date)
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${y}/${m}/${d}`
}
