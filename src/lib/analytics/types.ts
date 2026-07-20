// 分析画面のAPIレスポンス型・フィルタ状態型（クライアント/サーバー共用）
import type { CompareMode, Granularity, PresetKey } from '@/lib/analytics/period'

export const ANALYTICS_TABS = ['overview', 'sales', 'deals', 'customers', 'stores', 'inventory', 'engagement', 'tracking', 'ailab'] as const
export type AnalyticsTab = typeof ANALYTICS_TABS[number]

export const ANALYTICS_TAB_LABEL: Record<AnalyticsTab, string> = {
  overview: '概要',
  sales: '売上・買取',
  deals: '案件',
  customers: '顧客',
  stores: '店舗・スタッフ',
  inventory: '商品・在庫',
  engagement: '流入・接点',
  tracking: 'アクセス解析',
  ailab: 'AI分析',
}

/** AIがデータ集計に使えるタブ（ailab自身は除く） */
export const AI_QUERYABLE_TABS = ['overview', 'sales', 'deals', 'customers', 'stores', 'inventory', 'engagement', 'tracking'] as const

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

/* ─── AI分析のレスポンス型（クライアント/サーバー共用） ─── */

export type AiSeverity = 'info' | 'good' | 'warn' | 'bad'

export type AiInsightItem = { title: string; detail: string; severity?: AiSeverity }

/** タブAIインサイト要約 */
export type TabInsight = {
  headline: string
  highlights: AiInsightItem[]
  anomalies: AiInsightItem[]
  actions: AiInsightItem[]
}

/** AI生成レスポンスの共通メタ */
export type AiGenerated<T> = {
  content: T
  cached: boolean
  generatedAt: string
}

/** 売上予測 */
export type ForecastResult = {
  history: { label: string; value: number }[]
  forecast: { label: string; value: number; low: number; high: number }[]
  landing: { periodLabel: string; current: number; projected: number }
  commentary: AiInsightItem[]
}

/** チャート異常注釈 */
export type AnomalyAnnotation = {
  seriesKey: string
  seriesName: string
  label: string      // バケットラベル
  value: number
  expected: number
  direction: 'spike' | 'drop'
  explanation: string | null  // AIによる要因説明（上位のみ）
}
export type AnomaliesResult = { annotations: AnomalyAnnotation[]; summary: string | null }

/** チャートポイントのAI解説 */
export type ExplainPointResult = { headline: string; findings: AiInsightItem[] }

/** AIチャット */
export type ChatMessageItem = { role: 'user' | 'assistant'; content: string }
export type ChatResult = {
  answer: string
  usedData: string[]                          // 参照したデータの説明ラベル
  appliedFilters: Record<string, string> | null  // 画面に適用すべきフィルタ（自然言語フィルタ操作）
}

/** レポート / 週次ダイジェスト */
export type ReportResult = {
  title: string
  summary: string
  sections: { heading: string; body: string; bullets: string[] }[]
  risks: string[]
  nextActions: string[]
}

/** 店舗AI診断 */
export type DiagnosisResult = {
  score: number      // 0-100
  summary: string
  strengths: AiInsightItem[]
  weaknesses: AiInsightItem[]
  opportunities: AiInsightItem[]
  actions: AiInsightItem[]
}

/** 店舗不調予兆 */
export type StoreAlert = {
  store: string
  severity: AiSeverity
  metrics: { name: string; recent: number; previous: number; changePercent: number }[]
  hypothesis: string
  action: string
}
export type StoreAlertsResult = { summary: string; alerts: StoreAlert[] }

/** テキストマイニング */
export type TextMiningResult = {
  themes: { name: string; count: number; examples: string[]; insight: string }[]
  lostReasons: { name: string; count: number; detail: string }[]
  insights: string[]
  analyzedCount: number
}

/** RFMセグメント（数値はJS計算、adviceのみAI） */
export type RfmResult = {
  segments: {
    key: string
    label: string
    count: number
    totalAmount: number
    avgFrequency: number
    advice: string
  }[]
  summary: string
}

/** What-if（試算はJS、suggestionsのみAI） */
export type WhatIfAiAdvice = { summary: string; suggestions: AiInsightItem[] }
