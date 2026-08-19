'use client'

// 顧客一覧のフィルタ定義（チップ・詳細フィルター・プリセットビュー）。
// 管理ポータル・店舗ポータルで共用する。
import type { ChipDef, ChipOption } from './FilterChipBar'
import type { AdvField } from './AdvancedFilterPanel'
import type { ListView } from './ViewTabs'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import { PREFECTURES } from '@/lib/forms/types'

export const TYPE_OPTIONS: ChipOption[] = CUSTOMER_TYPES.map(t => ({
  value: t,
  label: CUSTOMER_TYPE_LABEL[t],
}))

export const LAST_VISIT_OPTIONS: ChipOption[] = [
  { value: 'never', label: '訪問実績なし' },
  { value: 'over90', label: '90日以上訪問なし' },
  { value: 'over180', label: '180日以上訪問なし' },
]

export const NEXT_VISIT_OPTIONS: ChipOption[] = [
  { value: 'none', label: '予定なし' },
  { value: 'has', label: '予定あり' },
  { value: '7d', label: '7日以内にあり' },
  { value: '30d', label: '30日以内にあり' },
]

export const FREQ_OPTIONS: ChipOption[] = [1, 2, 3, 6, 12].map(n => ({
  value: String(n),
  label: `${n}ヶ月ごと`,
}))

export const ID_DOC_OPTIONS: ChipOption[] = [
  { value: 'missing', label: '未提出' },
  { value: 'submitted', label: '提出済み' },
]

export const ADDR_VERIFY_OPTIONS: ChipOption[] = [
  { value: 'verified', label: '確認済み' },
  { value: 'mismatch', label: '不一致あり' },
  { value: 'pending', label: '書類審査中' },
]

export const BANK_OPTIONS: ChipOption[] = [
  { value: 'has', label: '登録済み' },
  { value: 'none', label: '未登録' },
]

export const PREFECTURE_OPTIONS: ChipOption[] = (PREFECTURES as readonly string[]).map(p => ({
  value: p, label: p,
}))

export function tagOptions(tags: { label: string }[]): ChipOption[] {
  return [
    { value: 'none', label: 'タグなし' },
    ...tags.map(t => ({ value: t.label, label: t.label })),
  ]
}

export function leadSourceOptions(leadSources: { name: string }[]): ChipOption[] {
  return [
    { value: 'none', label: '未設定' },
    ...leadSources.map(ls => ({ value: ls.name, label: ls.name })),
  ]
}

/** 店舗ポータルのクイックフィルタチップ */
export function storeChips(leadSources: { name: string }[]): ChipDef[] {
  return [
    { key: 'types', label: 'タイプ', type: 'multi', options: TYPE_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
    { key: 'lastVisit', label: '最終訪問', type: 'single', options: LAST_VISIT_OPTIONS },
    { key: 'nextVisit', label: '次回予定', type: 'single', options: NEXT_VISIT_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as ChipDef]
      : []),
  ]
}

/** 管理ポータルのクイックフィルタチップ */
export function adminChips(
  stores: { id: string; name: string }[],
  leadSources: { name: string }[],
  tags: { label: string }[] = []
): ChipDef[] {
  return [
    {
      key: 'storeId', label: '店舗', type: 'single',
      options: [
        { value: 'unassigned', label: '未割り当て' },
        ...stores.map(s => ({ value: s.id, label: s.name })),
      ],
    },
    { key: 'types', label: 'タイプ', type: 'multi', options: TYPE_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
    { key: 'lastVisit', label: '最終訪問', type: 'single', options: LAST_VISIT_OPTIONS },
    { key: 'nextVisit', label: '次回予定', type: 'single', options: NEXT_VISIT_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as ChipDef]
      : []),
    ...(tags.length > 0
      ? [{ key: 'tags', label: 'タグ', type: 'multi', options: tagOptions(tags) } as ChipDef]
      : []),
  ]
}

/** 店舗ポータルの詳細フィルター項目 */
export function storeAdvFields(leadSources: { name: string }[]): AdvField[] {
  return [
    { key: 'types', label: '顧客タイプ', type: 'multi', options: TYPE_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
    { key: 'lastVisit', label: '最終訪問', type: 'single', options: LAST_VISIT_OPTIONS },
    { key: 'nextVisit', label: '次回訪問予定', type: 'single', options: NEXT_VISIT_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as AdvField]
      : []),
    { key: 'freq', label: '訪問頻度', type: 'multi', options: FREQ_OPTIONS },
    { key: 'prefecture', label: '都道府県', type: 'single', options: PREFECTURE_OPTIONS },
  ]
}

/** 管理ポータルの詳細フィルター項目 */
export function adminAdvFields(
  stores: { id: string; name: string }[],
  leadSources: { name: string }[],
  tags: { label: string }[] = []
): AdvField[] {
  return [
    {
      key: 'storeId', label: '担当店舗', type: 'single',
      options: [
        { value: 'unassigned', label: '未割り当て' },
        ...stores.map(s => ({ value: s.id, label: s.name })),
      ],
    },
    { key: 'types', label: '顧客タイプ', type: 'multi', options: TYPE_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
    { key: 'lastVisit', label: '最終訪問', type: 'single', options: LAST_VISIT_OPTIONS },
    { key: 'nextVisit', label: '次回訪問予定', type: 'single', options: NEXT_VISIT_OPTIONS },
    ...(leadSources.length > 0
      ? [{ key: 'leadSources', label: '流入経路', type: 'multi', options: leadSourceOptions(leadSources) } as AdvField]
      : []),
    { key: 'tags', label: 'タグ', type: 'multi', options: tagOptions(tags) },
    { key: 'idDoc', label: '身分証明書', type: 'single', options: ID_DOC_OPTIONS },
    { key: 'addrVerify', label: '住所確認', type: 'single', options: ADDR_VERIFY_OPTIONS },
    { key: 'bank', label: '振込先口座', type: 'single', options: BANK_OPTIONS },
    { key: 'freq', label: '訪問頻度', type: 'multi', options: FREQ_OPTIONS },
    { key: 'prefecture', label: '都道府県', type: 'single', options: PREFECTURE_OPTIONS },
    {
      key: 'includeInactive', label: '無効化済み顧客', type: 'single',
      options: [{ value: 'true', label: '無効化済みも含める' }],
    },
  ]
}

/** プリセットビュー（店舗） */
export const STORE_PRESET_VIEWS: ListView[] = [
  { id: 'preset-all', name: 'すべての顧客', filters: '', preset: true },
  { id: 'preset-no-next', name: '次回予定なし', filters: 'nextVisit=none', preset: true },
  { id: 'preset-stale', name: '90日以上訪問なし', filters: 'lastVisit=over90', preset: true },
]

/** プリセットビュー（管理） */
export const ADMIN_PRESET_VIEWS: ListView[] = [
  { id: 'preset-all', name: 'すべての顧客', filters: '', preset: true },
  { id: 'preset-unassigned', name: '未割り当て', filters: 'storeId=unassigned', preset: true },
  { id: 'preset-no-id', name: '身分証未提出', filters: 'idDoc=missing', preset: true },
  { id: 'preset-stale', name: '90日以上訪問なし', filters: 'lastVisit=over90', preset: true },
  { id: 'preset-no-next', name: '次回予定なし', filters: 'nextVisit=none', preset: true },
]

/** URL・保存ビューで扱うフィルタキー（pageは含めない） */
export const FILTER_PARAM_KEYS = [
  'search', 'types', 'leadSources', 'createdFrom', 'createdTo',
  'lastVisit', 'nextVisit', 'freq', 'prefecture', 'sort',
  'storeId', 'includeInactive', 'idDoc', 'addrVerify', 'bank', 'tags',
] as const

/** フィルタ文字列(クエリ文字列)をparamsオブジェクトへ */
export function parseFilterString(filters: string): Record<string, string> {
  const sp = new URLSearchParams(filters)
  const out: Record<string, string> = {}
  for (const k of FILTER_PARAM_KEYS) {
    const v = sp.get(k)
    if (v) out[k] = v
  }
  return out
}
