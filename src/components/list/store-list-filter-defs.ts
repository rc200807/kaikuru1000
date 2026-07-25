'use client'

// 管理ポータル「店舗一覧」のフィルタ定義（チップ・詳細フィルター・プリセットビュー）と
// クライアント側フィルタ本体。店舗は最大200件程度のため全件取得＋クライアント絞り込みで運用する。
import type { ChipDef, ChipOption } from './FilterChipBar'
import type { AdvField } from './AdvancedFilterPanel'
import type { ListView } from './ViewTabs'
import { PREFECTURES } from '@/lib/prefectures'
import { parseServiceAreas } from '@/lib/address-utils'
import { STORE_STATUSES, normalizeStoreStatus } from '@/lib/store-status'

export const STORE_STATUS_OPTIONS: ChipOption[] = STORE_STATUSES.map(s => ({ value: s.value, label: s.label }))

export const LOGIN_OPTIONS: ChipOption[] = [
  { value: 'active', label: 'アクティブ（ログイン済み）' },
  { value: 'never', label: '未ログイン' },
]

export const STORE_PREFECTURE_OPTIONS: ChipOption[] = [
  { value: 'none', label: '未設定' },
  ...(PREFECTURES as readonly string[]).map(p => ({ value: p, label: p })),
]

export const COVER_PREF_OPTIONS: ChipOption[] = [
  { value: 'none', label: '未登録' },
  { value: 'has', label: '登録あり' },
  ...(PREFECTURES as readonly string[]).map(p => ({ value: p, label: `${p}をカバー` })),
]

// 情報不備（いずれかが未設定 = OR判定）
export const STORE_MISSING_OPTIONS: ChipOption[] = [
  { value: 'email', label: 'メール未設定' },
  { value: 'phone', label: '電話未設定' },
  { value: 'postal', label: '郵便番号未設定' },
  { value: 'bank', label: '銀行口座未設定' },
  { value: 'invoice', label: 'インボイス未設定' },
  { value: 'permit', label: '古物許可未設定' },
]

export const CUSTOMER_BUCKET_OPTIONS: ChipOption[] = [
  { value: '0', label: '0名' },
  { value: '1-9', label: '1〜9名' },
  { value: '10-49', label: '10〜49名' },
  { value: '50+', label: '50名以上' },
]

/** クイックフィルタチップ */
export function storeListChips(): ChipDef[] {
  return [
    { key: 'storeStatus', label: 'ステータス', type: 'single', options: STORE_STATUS_OPTIONS },
    { key: 'login', label: 'ログイン状態', type: 'single', options: LOGIN_OPTIONS },
    { key: 'prefecture', label: '所在都道府県', type: 'multi', options: STORE_PREFECTURE_OPTIONS },
    { key: 'coverPref', label: '対応エリア', type: 'single', options: COVER_PREF_OPTIONS },
    { key: 'missing', label: '情報不備', type: 'multi', options: STORE_MISSING_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
  ]
}

/** 詳細フィルター項目 */
export function storeListAdvFields(operators: { id: string; name: string }[]): AdvField[] {
  return [
    { key: 'search', label: 'フリーテキスト', type: 'text', placeholder: '店舗名・コード・住所・メールなど' },
    { key: 'storeStatus', label: 'ステータス', type: 'single', options: STORE_STATUS_OPTIONS },
    { key: 'login', label: 'ログイン状態', type: 'single', options: LOGIN_OPTIONS },
    { key: 'prefecture', label: '所在都道府県', type: 'multi', options: STORE_PREFECTURE_OPTIONS },
    { key: 'coverPref', label: '対応エリア', type: 'single', options: COVER_PREF_OPTIONS },
    { key: 'missing', label: '情報不備（いずれかが未設定）', type: 'multi', options: STORE_MISSING_OPTIONS },
    {
      key: 'operatorId', label: '運営者', type: 'single',
      options: [
        { value: 'none', label: '未設定' },
        ...operators.map(o => ({ value: o.id, label: o.name })),
      ],
    },
    { key: 'customers', label: '顧客数', type: 'single', options: CUSTOMER_BUCKET_OPTIONS },
    { key: 'created', label: '登録日', type: 'daterange' },
    { key: 'opened', label: '開業日', type: 'daterange' },
  ]
}

/** プリセットビュー */
export const STORES_PRESET_VIEWS: ListView[] = [
  { id: 'preset-all', name: 'すべての店舗', filters: '', preset: true },
  { id: 'preset-never-login', name: '未ログイン', filters: 'login=never&storeStatus=active', preset: true },
  { id: 'preset-missing', name: '情報不備あり', filters: 'missing=email,phone,postal,bank,invoice,permit', preset: true },
  { id: 'preset-no-area', name: '対応エリア未登録', filters: 'coverPref=none&storeStatus=active', preset: true },
  { id: 'preset-closed', name: '閉店', filters: 'storeStatus=closed', preset: true },
]

/** URL・保存ビューで扱うフィルタキー */
export const STORE_FILTER_PARAM_KEYS = [
  'search', 'storeStatus', 'login', 'prefecture', 'coverPref', 'missing',
  'operatorId', 'customers', 'createdFrom', 'createdTo', 'openedFrom', 'openedTo',
] as const

/** フィルタ文字列(クエリ文字列)をparamsオブジェクトへ */
export function parseStoreFilterString(filters: string): Record<string, string> {
  const sp = new URLSearchParams(filters)
  const out: Record<string, string> = {}
  for (const k of STORE_FILTER_PARAM_KEYS) {
    const v = sp.get(k)
    if (v) out[k] = v
  }
  return out
}

// ─────────────────────────────────────────────
// クライアント側フィルタ本体
// ─────────────────────────────────────────────

/** applyStoreFilters が参照する店舗の形（page.tsx の Store 型のサブセット） */
export type FilterableStore = {
  name: string
  code: string
  prefecture: string | null
  postalCode: string | null
  address: string | null
  phone: string | null
  email: string | null
  storeStatus: string | null
  openingDate: string | null
  bankInfo: string | null
  bankName: string | null
  accountNumber: string | null
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  serviceAreas: string | null
  operatorId: string | null
  createdAt?: string | null
  hasLoggedIn?: boolean
  _count: { customers: number }
}

/** 銀行口座が設定済みか（構造化フィールド or レガシー自由記述のどちらかがあれば設定済み扱い） */
function hasBankAccount(s: FilterableStore): boolean {
  if (s.bankName && s.accountNumber) return true
  return !!(s.bankInfo && s.bankInfo.trim())
}

/** 情報不備キー → 未設定判定 */
export function storeMissingKeys(s: FilterableStore): string[] {
  const missing: string[] = []
  if (!s.email) missing.push('email')
  if (!s.phone) missing.push('phone')
  if (!s.postalCode) missing.push('postal')
  if (!hasBankAccount(s)) missing.push('bank')
  if (!s.invoiceNumber) missing.push('invoice')
  if (!s.antiquePermitNumber) missing.push('permit')
  return missing
}

/** 情報不備キー → 表示ラベル */
export const MISSING_LABEL: Record<string, string> = Object.fromEntries(
  STORE_MISSING_OPTIONS.map(o => [o.value, o.label])
)

function inCustomerBucket(count: number, bucket: string): boolean {
  switch (bucket) {
    case '0': return count === 0
    case '1-9': return count >= 1 && count <= 9
    case '10-49': return count >= 10 && count <= 49
    case '50+': return count >= 50
    default: return true
  }
}

/** ISO日時 or YYYY-MM-DD を YYYY-MM-DD へ */
function ymd(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : ''
}

function inDateRange(value: string, from: string | undefined, to: string | undefined): boolean {
  if (!from && !to) return true
  if (!value) return false
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

/**
 * クライアント側フィルタ本体（純関数）。
 * params の各キーは空なら素通し、値があれば AND で絞る。
 * multi 系（prefecture / missing）はカンマ区切り値の OR。
 */
export function applyStoreFilters<T extends FilterableStore>(
  stores: T[],
  params: Record<string, string>
): T[] {
  const q = (params.search || '').trim().toLowerCase()
  const statusF = params.storeStatus || ''
  const loginF = params.login || ''
  const prefs = params.prefecture ? params.prefecture.split(',').filter(Boolean) : []
  const coverPref = params.coverPref || ''
  const missingF = params.missing ? params.missing.split(',').filter(Boolean) : []
  const operatorF = params.operatorId || ''
  const bucketF = params.customers || ''

  return stores.filter(s => {
    // ステータス（未設定・不明値は active 扱い）
    if (statusF) {
      if (normalizeStoreStatus(s.storeStatus) !== statusF) return false
    }

    // ログイン状態
    if (loginF === 'active' && !s.hasLoggedIn) return false
    if (loginF === 'never' && s.hasLoggedIn) return false

    // 所在都道府県（OR）
    if (prefs.length > 0) {
      const p = s.prefecture || ''
      const match = prefs.some(f => (f === 'none' ? !p : p === f))
      if (!match) return false
    }

    // 対応エリア
    if (coverPref) {
      const areas = parseServiceAreas(s.serviceAreas)
      if (coverPref === 'none') {
        if (areas.length > 0) return false
      } else if (coverPref === 'has') {
        if (areas.length === 0) return false
      } else if (!areas.some(a => a.prefecture === coverPref)) {
        return false
      }
    }

    // 情報不備（いずれかが未設定 = OR）
    if (missingF.length > 0) {
      const missing = storeMissingKeys(s)
      if (!missingF.some(k => missing.includes(k))) return false
    }

    // 運営者
    if (operatorF) {
      if (operatorF === 'none') {
        if (s.operatorId) return false
      } else if (s.operatorId !== operatorF) {
        return false
      }
    }

    // 顧客数バケット
    if (bucketF && !inCustomerBucket(s._count.customers, bucketF)) return false

    // 登録日・開業日
    if (!inDateRange(ymd(s.createdAt), params.createdFrom, params.createdTo)) return false
    if (!inDateRange(ymd(s.openingDate), params.openedFrom, params.openedTo)) return false

    // フリーテキスト検索（name/code/都道府県/メール/電話/住所/対応エリア）
    if (q) {
      const areaText = parseServiceAreas(s.serviceAreas)
        .flatMap(a => [a.prefecture, ...a.cities])
        .join(' ')
        .toLowerCase()
      const hit =
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.prefecture || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        areaText.includes(q)
      if (!hit) return false
    }

    return true
  })
}
