/**
 * 店舗ポータルのサイドメニュー（ナビゲーション）の中央定義。
 * - 並び順・表示/非表示は管理ポータル（/admin/settings/store-menu）から制御する
 * - 既定の並び順はこの配列の順序。DB に設定がない項目はこの位置に入る
 * - アイコンは JSX なので src/components/store/storeNavIcons.tsx に分離している
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */

/** 項目ごとの追加条件（管理ポータルの設定に加えて満たす必要がある） */
export type StoreNavGate =
  | 'akikuru'   // 店舗の対応サービスに「アキクル」が含まれる
  | 'orgAdmin'  // 運営者配下 かつ 組織管理者

export type StoreNavItemDef = {
  /** DB・API で使う安定キー */
  key: string
  href: string
  /** サイドレール／メニューでのラベル */
  label: string
  /** モバイル下部バーに固定表示する項目のラベル（未指定なら下部バーには出さない） */
  mobileBarLabel?: string
  gate?: StoreNavGate
  /** 非表示にできない項目（ダッシュボードなど動線の起点） */
  locked?: boolean
}

/** 既定の並び順 = この配列の順序 */
export const STORE_NAV_ITEMS: readonly StoreNavItemDef[] = [
  { key: 'dashboard',       href: '/store/dashboard',       label: 'ダッシュボード', mobileBarLabel: 'ホーム', locked: true },
  { key: 'deals',           href: '/store/deals',           label: '案件' },
  { key: 'schedule',        href: '/store/schedule',        label: 'スケジュール', mobileBarLabel: 'スケジュール' },
  { key: 'customers',       href: '/store/customers',       label: '顧客', mobileBarLabel: '顧客' },
  { key: 'members',         href: '/store/members',         label: 'メンバー' },
  { key: 'market',          href: '/store/market',          label: '相場検索' },
  { key: 'announcements',   href: '/store/announcements',   label: 'お知らせ' },
  { key: 'chiebukuro',      href: '/store/chiebukuro',      label: '知恵袋' },
  { key: 'chat',            href: '/store/chat',            label: '本部チャット' },
  { key: 'knowledge',       href: '/store/knowledge',       label: 'ナレッジベース' },
  { key: 'line',            href: '/store/line',            label: 'LINEトーク' },
  { key: 'inquiries',       href: '/store/inquiries',       label: '問い合わせ' },
  { key: 'purchase-items',  href: '/store/purchase-items',  label: '買取品目' },
  { key: 'inventory',       href: '/store/inventory',       label: '在庫' },
  { key: 'training-videos', href: '/store/training-videos', label: '研修動画' },
  { key: 'bug-report',      href: '/store/bug-report',      label: '不具合報告' },
  { key: 'mystore',         href: '/store/mystore',         label: '店舗情報' },
  { key: 'akiya',           href: '/store/akiya',           label: '空き家管理', gate: 'akikuru' },
  { key: 'organization',    href: '/store/organization',    label: '組織管理', gate: 'orgAdmin' },
]

export const STORE_NAV_KEYS: readonly string[] = STORE_NAV_ITEMS.map(i => i.key)

const DEF_BY_KEY = new Map(STORE_NAV_ITEMS.map(i => [i.key, i]))
const INDEX_BY_KEY = new Map(STORE_NAV_ITEMS.map((i, idx) => [i.key, idx]))

export function storeNavItem(key: string): StoreNavItemDef | undefined {
  return DEF_BY_KEY.get(key)
}

export const STORE_NAV_GATE_LABEL: Record<StoreNavGate, string> = {
  akikuru: 'アキクル対応店舗のみ',
  orgAdmin: '組織管理者のみ',
}

/** DB の StoreNavSetting 行（必要な列だけ） */
export type StoreNavSettingRow = { key: string; sortOrder: number; visible: boolean }
/** DB の StoreNavOverride 行（必要な列だけ） */
export type StoreNavOverrideRow = { showAll: boolean; items: string }

/** items JSON（{ key: boolean }）を安全にパース。未知キー・非boolean値は捨てる */
export function parseStoreNavOverrideItems(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (DEF_BY_KEY.has(k) && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** { key: boolean } → 正規化済みJSON文字列（未知キー除外・定義順） */
export function stringifyStoreNavOverrideItems(items: Record<string, boolean> | null | undefined): string {
  if (!items) return '{}'
  const out: Record<string, boolean> = {}
  for (const key of STORE_NAV_KEYS) {
    const v = items[key]
    if (typeof v === 'boolean') out[key] = v
  }
  return JSON.stringify(out)
}

/** 共通設定を「定義順で埋めた」配列に正規化（管理画面の初期表示に使う） */
export function mergeStoreNavSettings(
  settings: readonly StoreNavSettingRow[] | null | undefined,
): { key: string; sortOrder: number; visible: boolean }[] {
  const byKey = new Map((settings ?? []).map(s => [s.key, s]))
  return STORE_NAV_ITEMS
    .map((def, idx) => {
      const row = byKey.get(def.key)
      return {
        key: def.key,
        sortOrder: row ? row.sortOrder : idx,
        visible: def.locked ? true : row ? row.visible : true,
        _idx: idx,
      }
    })
    .sort((a, b) => (a.sortOrder - b.sortOrder) || (a._idx - b._idx))
    .map(({ key, sortOrder, visible }) => ({ key, sortOrder, visible }))
}

/**
 * 店舗に表示するメニューのキー配列を解決する（並び順つき）。
 * 優先順位: 固定表示(locked) > 店舗特例(showAll / items) > 共通設定 > 既定(表示)
 * gate（アキクル・組織管理者）はクライアント側で別途判定する。
 */
export function resolveStoreNavKeys(opts: {
  settings?: readonly StoreNavSettingRow[] | null
  override?: StoreNavOverrideRow | null
}): string[] {
  const overrideItems = parseStoreNavOverrideItems(opts.override?.items)
  const showAll = !!opts.override?.showAll
  const bySettingKey = new Map((opts.settings ?? []).map(s => [s.key, s]))

  return mergeStoreNavSettings(opts.settings)
    .filter(row => {
      const def = DEF_BY_KEY.get(row.key)
      if (!def) return false
      if (def.locked) return true
      if (showAll) return true
      const ov = overrideItems[row.key]
      if (typeof ov === 'boolean') return ov
      const setting = bySettingKey.get(row.key)
      return setting ? setting.visible : true
    })
    .map(row => row.key)
}

/** 設定が未取得のときに使う既定の表示キー（既定はすべて表示） */
export const DEFAULT_STORE_NAV_KEYS: readonly string[] = STORE_NAV_KEYS

/** 与えられたキー配列を定義順ではなく「配列の順序」で項目定義に解決する */
export function storeNavItemsFromKeys(keys: readonly string[]): StoreNavItemDef[] {
  const seen = new Set<string>()
  const items: StoreNavItemDef[] = []
  for (const key of keys) {
    if (seen.has(key)) continue
    const def = DEF_BY_KEY.get(key)
    if (!def) continue
    seen.add(key)
    items.push(def)
  }
  return items
}

/** 既定の並び順（定義順）でのインデックス。並び替えの安定ソート用 */
export function storeNavDefaultIndex(key: string): number {
  return INDEX_BY_KEY.get(key) ?? Number.MAX_SAFE_INTEGER
}

/**
 * gate（追加条件）を満たすか判定する。
 * 並び順・表示可否は管理ポータル（/admin/settings/store-menu）の設定が正で、
 * ここでは店舗の状態にしか依存しない条件だけを見る。
 */
export function passesStoreNavGate(
  item: StoreNavItemDef,
  scope: { services: string[]; availableStores: unknown[]; isOrgAdmin: boolean },
): boolean {
  if (item.gate === 'akikuru') return scope.services.includes('akikuru')
  if (item.gate === 'orgAdmin') return scope.availableStores.length > 0 && scope.isOrgAdmin
  return true
}
