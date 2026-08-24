'use client'

// 案件一覧のフィルタ定義（店舗ポータル用）。
// 管理ポータル用の deal-filter-defs.ts とは分離し、共通の選択肢だけを再利用する。
// 店舗指定（storeIds）は出さない: 店舗ポータルの対象店舗は StoreScopeContext が決めるため。
import type { ChipDef, ChipOption } from './FilterChipBar'
import type { AdvField } from './AdvancedFilterPanel'
import type { ListView } from './ViewTabs'
import {
  STATUS_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  HAS_CONTRACT_OPTIONS,
  SOURCE_OPTIONS,
  leadSourceOptions,
} from './deal-filter-defs'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL, type DealCategory } from '@/lib/deal-categories'
import { STORE_DEAL_FILTER_PARAM_KEYS } from '@/lib/deal-list-query'

/** 訪問予定（相対指定）。サーバーの visitWithin と対応 */
export const VISIT_WITHIN_OPTIONS: ChipOption[] = [
  { value: 'today', label: '今日' },
  { value: 'tomorrow', label: '明日' },
  { value: '7d', label: '7日以内' },
  { value: 'overdue', label: '予定日超過（未記録）' },
  { value: 'none', label: '予定なし' },
]

export const HAS_PRE_CONSENT_OPTIONS: ChipOption[] = [
  { value: 'yes', label: '取得済み' },
  { value: 'no', label: '未取得' },
]

export const STALE_DAYS_OPTIONS: ChipOption[] = [
  { value: '7', label: '7日以上' },
  { value: '14', label: '14日以上' },
  { value: '30', label: '30日以上' },
]

/** カテゴリー選択肢。アキクルは対応サービスに含む店舗にだけ出す */
export function dealCategoryOptionsFor(services: string[]): ChipOption[] {
  return DEAL_CATEGORIES
    .filter((c: DealCategory) => c !== 'akikuru' || services.includes('akikuru'))
    .map(c => ({ value: c, label: DEAL_CATEGORY_LABEL[c] }))
}

/** 担当メンバー選択肢。自分を先頭に出し「（自分）」を添える */
export function storeMemberOptions(
  members: { id: string; name: string }[],
  selfMemberId: string | null,
): ChipOption[] {
  const self = selfMemberId ? members.find(m => m.id === selfMemberId) : null
  const rest = members.filter(m => m.id !== self?.id)
  return [
    ...(self ? [{ value: self.id, label: `${self.name}（自分）` }] : []),
    ...rest.map(m => ({ value: m.id, label: m.name })),
  ]
}

/** クイックフィルタチップ（7本） */
export function storeDealChips(
  members: { id: string; name: string }[],
  leadSources: { name: string }[],
  services: string[],
  selfMemberId: string | null,
): ChipDef[] {
  return [
    { key: 'statuses', label: 'ステータス', type: 'multi', options: STATUS_OPTIONS },
    { key: 'visitWithin', label: '訪問予定', type: 'single', options: VISIT_WITHIN_OPTIONS },
    { key: 'categories', label: 'カテゴリー', type: 'multi', options: dealCategoryOptionsFor(services) },
    ...(members.length > 0
      ? [{ key: 'members', label: '担当', type: 'multi', options: storeMemberOptions(members, selfMemberId) } as ChipDef]
      : []),
    { key: 'occurred', label: '案件発生日', type: 'daterange' },
    { key: 'created', label: '作成日', type: 'daterange' },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as ChipDef]
      : []),
  ]
}

/** 詳細フィルター項目（14項目） */
export function storeDealAdvFields(
  members: { id: string; name: string }[],
  leadSources: { name: string }[],
  services: string[],
  selfMemberId: string | null,
): AdvField[] {
  return [
    { key: 'statuses', label: 'ステータス', type: 'multi', options: STATUS_OPTIONS },
    { key: 'categories', label: 'カテゴリー', type: 'multi', options: dealCategoryOptionsFor(services) },
    { key: 'visitWithin', label: '訪問予定', type: 'single', options: VISIT_WITHIN_OPTIONS },
    { key: 'hasPreConsent', label: '事前同意', type: 'single', options: HAS_PRE_CONSENT_OPTIONS },
    { key: 'hasContract', label: '売買契約書', type: 'single', options: HAS_CONTRACT_OPTIONS },
    ...(members.length > 0
      ? [{ key: 'members', label: '担当メンバー', type: 'multi', options: storeMemberOptions(members, selfMemberId) } as AdvField]
      : []),
    { key: 'customerTypes', label: '顧客種別', type: 'multi', options: CUSTOMER_TYPE_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as AdvField]
      : []),
    { key: 'occurred', label: '案件発生日', type: 'daterange' },
    { key: 'created', label: '作成日', type: 'daterange' },
    { key: 'staleDays', label: '動きがない期間', type: 'single', options: STALE_DAYS_OPTIONS },
    { key: 'amountMin', label: '買取金額（下限・円）', type: 'text', placeholder: '例: 10000' },
    { key: 'amountMax', label: '買取金額（上限・円）', type: 'text', placeholder: '例: 500000' },
    { key: 'source', label: '由来', type: 'single', options: SOURCE_OPTIONS },
  ]
}

/** 今月の開始日(JST, YYYY-MM-DD)。プリセットを関数で作るのは日跨ぎでズレないようにするため */
function jstMonthStartStr(): string {
  const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  return `${ymd.slice(0, 7)}-01`
}

/** プリセットビュー（8本）。memberId があるときだけ「自分の担当」を出す */
export function storeDealPresetViews(memberId: string | null): ListView[] {
  return [
    { id: 'preset-all', name: 'すべての案件', filters: '', preset: true },
    ...(memberId
      ? [{ id: 'preset-mine', name: '自分の担当', filters: `members=${memberId}`, preset: true } as ListView]
      : []),
    { id: 'preset-visit-today', name: '今日の訪問', filters: 'visitWithin=today', preset: true },
    { id: 'preset-visit-unset', name: '訪問日未設定', filters: 'statuses=visit_decided&visitWithin=none', preset: true },
    { id: 'preset-preconsent', name: '事前同意なし', filters: 'visitWithin=7d&hasPreConsent=no', preset: true },
    { id: 'preset-doc-missing', name: '書類未作成', filters: 'statuses=contract,completed&hasContract=no', preset: true },
    { id: 'preset-stale', name: '放置14日', filters: 'staleDays=14&statuses=inquiry,visit_decided,estimate_only', preset: true },
    { id: 'preset-won-month', name: '今月の契約・完了', filters: `statuses=contract,completed&occurredFrom=${jstMonthStartStr()}`, preset: true },
  ]
}

/** 保存ビューのフィルタ文字列 → 値オブジェクト */
export function parseStoreDealFilterString(filters: string): Record<string, string> {
  const sp = new URLSearchParams(filters)
  const out: Record<string, string> = {}
  for (const k of STORE_DEAL_FILTER_PARAM_KEYS) {
    const v = sp.get(k)
    if (v) out[k] = v
  }
  // daterange は `${key}From/To` の2キーなので個別に拾う
  for (const k of ['createdFrom', 'createdTo', 'occurredFrom', 'occurredTo']) {
    const v = sp.get(k)
    if (v) out[k] = v
  }
  return out
}
