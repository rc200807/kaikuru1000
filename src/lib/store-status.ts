// 店舗の営業ステータスの中央定義（サーバー・クライアント共用。'use client' は付けない）
// storeStatus は Store.storeStatus（String?）に格納する自由文字列。未設定は "active"（営業中）扱い。

export type StoreStatusOption = { value: string; label: string }

export const STORE_STATUSES: StoreStatusOption[] = [
  { value: 'active', label: '営業中' },
  { value: 'preopen', label: 'オープン前' },
  { value: 'hiatus', label: '休業中' },
  { value: 'closed', label: '閉店' },
  { value: 'transferred', label: '移管済' },
]

const STORE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STORE_STATUSES.map(s => [s.value, s.label])
)

/** ステータス値 → 表示ラベル。未設定・不明値は「営業中」。 */
export function storeStatusLabel(value: string | null | undefined): string {
  if (!value) return '営業中'
  return STORE_STATUS_LABEL[value] ?? '営業中'
}

/** ステータス値を既知の値に正規化（未設定・不明値は "active"）。 */
export function normalizeStoreStatus(value: string | null | undefined): string {
  const v = value || 'active'
  return STORE_STATUS_LABEL[v] ? v : 'active'
}
