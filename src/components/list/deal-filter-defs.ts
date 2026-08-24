'use client'

// 案件一覧のフィルタ定義（チップ・詳細フィルター・プリセットビュー）。管理ポータル用。
import type { ChipDef, ChipOption } from './FilterChipBar'
import type { AdvField } from './AdvancedFilterPanel'
import type { ListView } from './ViewTabs'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import { DEAL_FILTER_PARAM_KEYS as PARAM_KEYS } from '@/lib/deal-list-query'

export const STATUS_OPTIONS: ChipOption[] = DEAL_STATUS_ORDER.map(s => ({ value: s, label: DEAL_STATUS_LABEL[s] }))
export const CATEGORY_OPTIONS: ChipOption[] = DEAL_CATEGORIES.map(c => ({ value: c, label: DEAL_CATEGORY_LABEL[c] }))
export const CUSTOMER_TYPE_OPTIONS: ChipOption[] = CUSTOMER_TYPES.map(t => ({ value: t, label: CUSTOMER_TYPE_LABEL[t] }))
export const HAS_CONTRACT_OPTIONS: ChipOption[] = [
  { value: 'yes', label: '契約書あり' },
  { value: 'no', label: '契約書なし' },
]
export const SOURCE_OPTIONS: ChipOption[] = [
  { value: 'inquiry', label: '問い合わせ由来' },
  { value: 'manual', label: '手動作成' },
]

export function storeOptions(stores: { id: string; name: string }[]): ChipOption[] {
  return [
    { value: 'unassigned', label: '店舗未割り当て' },
    ...stores.map(s => ({ value: s.id, label: s.name })),
  ]
}
export function leadSourceOptions(leadSources: { name: string }[]): ChipOption[] {
  return [
    { value: 'none', label: '未設定' },
    ...leadSources.map(ls => ({ value: ls.name, label: ls.name })),
  ]
}
export function memberOptions(members: { id: string; name: string; store?: { name: string } | null }[]): ChipOption[] {
  return members.map(m => ({ value: m.id, label: m.store?.name ? `${m.name}（${m.store.name}）` : m.name }))
}

/** クイックフィルタチップ */
export function dealChips(stores: { id: string; name: string }[], leadSources: { name: string }[]): ChipDef[] {
  return [
    { key: 'statuses', label: 'ステータス', type: 'multi', options: STATUS_OPTIONS },
    { key: 'categories', label: 'カテゴリー', type: 'multi', options: CATEGORY_OPTIONS },
    ...(stores.length > 0
      ? [{ key: 'storeIds', label: '店舗', type: 'multi', options: storeOptions(stores) } as ChipDef]
      : []),
    { key: 'created', label: '作成日', type: 'daterange' },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as ChipDef]
      : []),
  ]
}

/** 詳細フィルター項目 */
export function dealAdvFields(
  stores: { id: string; name: string }[],
  leadSources: { name: string }[],
  members: { id: string; name: string; store?: { name: string } | null }[],
): AdvField[] {
  return [
    { key: 'statuses', label: 'ステータス', type: 'multi', options: STATUS_OPTIONS },
    { key: 'categories', label: 'カテゴリー', type: 'multi', options: CATEGORY_OPTIONS },
    ...(stores.length > 0
      ? [{ key: 'storeIds', label: '店舗', type: 'multi', options: storeOptions(stores) } as AdvField]
      : []),
    { key: 'customerTypes', label: '顧客種別', type: 'multi', options: CUSTOMER_TYPE_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as AdvField]
      : []),
    ...(members.length > 0
      ? [{ key: 'members', label: '担当メンバー', type: 'multi', options: memberOptions(members) } as AdvField]
      : []),
    { key: 'created', label: '作成日', type: 'daterange' },
    { key: 'occurred', label: '案件発生日', type: 'daterange' },
    { key: 'amountMin', label: '買取金額（下限・円）', type: 'text', placeholder: '例: 10000' },
    { key: 'amountMax', label: '買取金額（上限・円）', type: 'text', placeholder: '例: 500000' },
    { key: 'hasContract', label: '売買契約書', type: 'single', options: HAS_CONTRACT_OPTIONS },
    { key: 'source', label: '由来', type: 'single', options: SOURCE_OPTIONS },
  ]
}

/** 今月の開始日(JST, YYYY-MM-DD) — プリセットの occurredFrom 用 */
function jstMonthStartStr(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** プリセットビュー */
export const DEAL_PRESET_VIEWS: ListView[] = [
  { id: 'preset-all', name: 'すべての案件', filters: '', preset: true },
  { id: 'preset-open', name: '未対応', filters: 'statuses=inquiry', preset: true },
  { id: 'preset-won-month', name: '今月の契約・完了', filters: `statuses=contract,completed&occurredFrom=${jstMonthStartStr()}`, preset: true },
  { id: 'preset-lost', name: '失注', filters: 'statuses=lost_after_visit,lost_no_visit', preset: true },
  { id: 'preset-high', name: '高額（¥100,000〜）', filters: 'amountMin=100000', preset: true },
  { id: 'preset-inquiry', name: '問い合わせ由来', filters: 'source=inquiry', preset: true },
]

// フィルタキーの正は lib 側（サーバーと共有）。ここでは re-export だけして二重定義を避ける
export { DEAL_FILTER_PARAM_KEYS } from '@/lib/deal-list-query'

export function parseDealFilterString(filters: string): Record<string, string> {
  const sp = new URLSearchParams(filters)
  const out: Record<string, string> = {}
  for (const k of PARAM_KEYS) {
    const v = sp.get(k)
    if (v) out[k] = v
  }
  return out
}
