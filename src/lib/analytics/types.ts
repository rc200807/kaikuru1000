// 分析画面のAPIレスポンス型・フィルタ状態型（クライアント/サーバー共用）
import type { CompareMode, Granularity, PresetKey } from '@/lib/analytics/period'

export const ANALYTICS_TABS = ['overview', 'sales', 'deals', 'customers', 'stores', 'inventory', 'engagement'] as const
export type AnalyticsTab = typeof ANALYTICS_TABS[number]

export const ANALYTICS_TAB_LABEL: Record<AnalyticsTab, string> = {
  overview: '概要',
  sales: '売上・買取',
  deals: '案件',
  customers: '顧客',
  stores: '店舗・スタッフ',
  inventory: '商品・在庫',
  engagement: '流入・接点',
}

/** URL・API共通のフィルタ状態 */
export type AnalyticsQueryState = {
  tab: AnalyticsTab
  preset: PresetKey
  from: string | null // "yyyy-MM-dd"（custom時のみ）
  to: string | null
  compare: CompareMode
  granularity: Granularity | 'auto'
  storeId: string | null
  dealCategory: string | null
  customerType: string | null
  leadSource: string | null
}

export type KpiValue = { value: number; compareValue: number | null }

export type SeriesPoint = { label: string; [key: string]: string | number }

export type BreakdownItem = { name: string; count?: number; amount?: number; value?: number }

/** 全タブ共通のレスポンス骨格 */
export type AnalyticsResponse = {
  meta: {
    range: { from: string; to: string } // to は含む最終日（表示用）
    compareRange: { from: string; to: string } | null
    granularity: Granularity
    notes?: string[]
  }
  kpis: Record<string, KpiValue>
  series: Record<string, SeriesPoint[]>
  breakdowns: Record<string, BreakdownItem[]>
  tables: Record<string, Record<string, unknown>[]>
}

export type AnalyticsFilterOptions = {
  stores: { id: string; name: string }[]
  leadSources: string[]
}
