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
