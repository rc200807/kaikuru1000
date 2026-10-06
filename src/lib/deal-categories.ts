/**
 * 案件（Deal）カテゴリーの中央定義。
 * 表示ラベル、UIカラー、検証、顧客種別からの既定値算出の集約点。
 * customer-types.ts / deal-status.ts と同じパターン。
 */
import { parseCustomerTypes } from './customer-types'

export const DEAL_CATEGORIES = ['purchase', 'akikuru', 'ecotoku'] as const
export type DealCategory = typeof DEAL_CATEGORIES[number]

export const DEAL_CATEGORY_LABEL: Record<string, string> = {
  purchase: '買取案件',
  akikuru:  'アキクル案件',
  ecotoku:  'エコトク案件',
}

/** UI バッジ用カラー（{bg,fg} 形式） */
export const DEAL_CATEGORY_BADGE: Record<string, { bg: string; fg: string }> = {
  purchase: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  akikuru:  { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  ecotoku:  { bg: 'rgba(52,211,153,0.15)',  fg: '#34d399' },
}

/** 文字列が有効な DealCategory か判定 */
export function isDealCategory(v: string | null | undefined): v is DealCategory {
  return typeof v === 'string' && (DEAL_CATEGORIES as readonly string[]).includes(v)
}

/**
 * 顧客種別（customerType）から案件カテゴリーの既定値を導出する。
 * - アキクル(akikuru) → アキクル案件
 * - 訪問型(visit) / 宅配型(delivery) → エコトク案件
 * - それ以外（通常買取など） → 買取案件
 * 既存案件のバックフィルSQLと同じ対応表（DB移行と一致させること）。
 */
export function dealCategoryFromCustomerType(customerType: string | null | undefined): DealCategory {
  if (customerType === 'akikuru') return 'akikuru'
  if (customerType === 'visit' || customerType === 'delivery') return 'ecotoku'
  return 'purchase'
}

/**
 * 顧客の種別（主タイプ＋複数タイプの customerTypes 配列）から案件カテゴリーを決める。
 * 案件を作るすべての経路（手動作成・Webフォーム問い合わせ・訪問予定・訪問リクエスト）はこれを通す。
 * - 主タイプがアキクル → アキクル案件
 * - 「訪問型」「宅配型」のどちらかに分類されている（主タイプ or 複数タイプのいずれか）→ エコトク案件
 * - それ以外 → 買取案件
 */
export function dealCategoryForCustomer(
  customer: { customerType?: string | null; customerTypes?: string | null } | null | undefined,
): DealCategory {
  if (!customer) return 'purchase'
  if (customer.customerType === 'akikuru') return 'akikuru'
  const types = parseCustomerTypes(customer.customerTypes ?? null, customer.customerType ?? null)
  if ([customer.customerType, ...types].some(t => t === 'visit' || t === 'delivery')) return 'ecotoku'
  return dealCategoryFromCustomerType(customer.customerType)
}
