/**
 * 在庫（InventoryItem）のステータス・商品状態・配送オプションの中央定義。
 * deal-status.ts と同じ方針（文字列 union／日本語ラベル／インライン色バッジ／検証）。
 */

// ===== 在庫ステータス（ライフサイクル）=====
export const INVENTORY_STATUSES = ['draft', 'ready', 'listed', 'sold', 'archived'] as const
export type InventoryStatus = typeof INVENTORY_STATUSES[number]

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  draft:    '下書き',
  ready:    '出品準備完了',
  listed:   '出品中',
  sold:     '売却済み',
  archived: 'アーカイブ',
}

export const INVENTORY_STATUS_BADGE: Record<InventoryStatus, { bg: string; fg: string }> = {
  draft:    { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  ready:    { bg: 'rgba(96,165,250,0.15)',  fg: '#60a5fa' },
  listed:   { bg: 'rgba(45,212,191,0.15)',  fg: '#2dd4bf' },
  sold:     { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  archived: { bg: 'rgba(120,113,108,0.15)', fg: '#78716c' },
}

export function isInventoryStatus(v: string | null | undefined): v is InventoryStatus {
  return typeof v === 'string' && (INVENTORY_STATUSES as readonly string[]).includes(v)
}

// ===== 商品の状態（メルカリ6段階）=====
export const INVENTORY_CONDITIONS = [
  'new',
  'like_new',
  'no_noticeable_damage',
  'slight_damage',
  'damaged',
  'poor',
] as const
export type InventoryCondition = typeof INVENTORY_CONDITIONS[number]

export const INVENTORY_CONDITION_LABEL: Record<InventoryCondition, string> = {
  new:                  '新品、未使用',
  like_new:             '未使用に近い',
  no_noticeable_damage: '目立った傷や汚れなし',
  slight_damage:        'やや傷や汚れあり',
  damaged:              '傷や汚れあり',
  poor:                 '全体的に状態が悪い',
}

export function isInventoryCondition(v: string | null | undefined): v is InventoryCondition {
  return typeof v === 'string' && (INVENTORY_CONDITIONS as readonly string[]).includes(v)
}

// ===== 配送オプション（メルカリ出品向け）=====
export const SHIPPING_PAYERS = ['seller', 'buyer'] as const
export type ShippingPayer = typeof SHIPPING_PAYERS[number]
export const SHIPPING_PAYER_LABEL: Record<ShippingPayer, string> = {
  seller: '送料込み（出品者負担）',
  buyer:  '着払い（購入者負担）',
}

export const SHIPPING_DAYS = ['1-2', '2-3', '4-7'] as const
export type ShippingDays = typeof SHIPPING_DAYS[number]
export const SHIPPING_DAYS_LABEL: Record<ShippingDays, string> = {
  '1-2': '1〜2日で発送',
  '2-3': '2〜3日で発送',
  '4-7': '4〜7日で発送',
}
