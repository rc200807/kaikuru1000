/**
 * 顧客種別の中央定義。
 * 表示ラベル、UIカラー、マイページ判定の集約点。
 */

export const CUSTOMER_TYPES = ['visit', 'delivery', 'regular', 'akikuru'] as const
export type CustomerType = typeof CUSTOMER_TYPES[number]

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  visit:    '訪問型',
  delivery: '宅配型',
  regular:  '通常買取',
  akikuru:  'アキクル',
}

/** UI バッジ用カラー（CSS変数 or 直接色） */
export const CUSTOMER_TYPE_BADGE: Record<CustomerType, { bg: string; fg: string }> = {
  visit:    { bg: 'rgba(79,142,247,0.15)',  fg: '#4f8ef7' },
  delivery: { bg: 'rgba(232,146,124,0.15)', fg: '#E8927C' },
  regular:  { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  akikuru:  { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
}

/** Tailwind のピル用クラス（店舗ポータルの一覧・詳細のバッジ） */
export const CUSTOMER_TYPE_PILL_CLASS: Record<CustomerType, string> = {
  visit:    'bg-green-100 text-green-700',
  delivery: 'bg-blue-100 text-blue-700',
  regular:  'bg-purple-100 text-purple-700',
  akikuru:  'bg-amber-100 text-amber-700',
}

/**
 * 表示用のラベル＋ピルクラス。画面ごとに独自の対応表を持つと種別追加時に漏れる
 * （アキクルが対応表に無く「訪問型」にフォールバック表示されていた）ので、ここを通す。
 * 不明な値は訪問型に寄せず、値そのものをグレーで出す。
 */
export function customerTypePill(t: string | null | undefined): { label: string; cls: string } {
  if (isCustomerType(t)) return { label: CUSTOMER_TYPE_LABEL[t], cls: CUSTOMER_TYPE_PILL_CLASS[t] }
  return { label: t || '未設定', cls: 'bg-gray-100 text-gray-600' }
}

/** 文字列が有効な customerType か判定 */
export function isCustomerType(v: string | null | undefined): v is CustomerType {
  return typeof v === 'string' && (CUSTOMER_TYPES as readonly string[]).includes(v)
}

/**
 * customerTypes (JSONエンコードされた文字列) をパースして配列で返す。
 * 不正値はフィルタする。空ならフォールバックに [primary] を返す。
 */
export function parseCustomerTypes(json: string | null | undefined, primary?: string | null): CustomerType[] {
  let arr: unknown = []
  if (typeof json === 'string' && json.length > 0) {
    try { arr = JSON.parse(json) } catch { arr = [] }
  }
  const list = Array.isArray(arr)
    ? arr.filter(isCustomerType)
    : []
  if (list.length === 0 && isCustomerType(primary)) return [primary]
  return list
}

/** customerTypes 配列を JSON エンコードして返す。空なら [primary] にフォールバック */
export function stringifyCustomerTypes(types: CustomerType[], primary?: string | null): string {
  const list = types.filter(isCustomerType)
  if (list.length === 0 && isCustomerType(primary)) return JSON.stringify([primary])
  return JSON.stringify(list)
}

/**
 * 主タイプだけを変更するときの customerTypes（JSON文字列）。
 * 主タイプの置き換えは「そのタイプの顧客にする」操作なので、表示バッジ・一覧の絞り込みに使う
 * customerTypes も [新しい主タイプ] に揃える（揃えないと旧タイプのバッジが残り、絞り込みも旧タイプでヒットする）。
 * 一括変更（admin/users/bulk・stores/[id]/customers/bulk）と同じ規則。
 */
export function customerTypesForPrimary(primary: CustomerType): string {
  return JSON.stringify([primary])
}

/**
 * マイページ表示判定: アキクルは通常買取と同じビューを表示する。
 * 戻り値は表示用の "ビューキー"。delivery / visit / regular のいずれか。
 */
export type CustomerView = 'visit' | 'delivery' | 'regular'
export function customerView(primary: string | null | undefined): CustomerView {
  if (primary === 'delivery') return 'delivery'
  if (primary === 'visit')    return 'visit'
  // regular | akikuru | 不明 → regular ビュー
  return 'regular'
}
