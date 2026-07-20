'use client'

// 分析タブ共通の小物（KPIカード・ローディング・エラー・期間キャプション）
import KpiCard from '@/components/charts/KpiCard'
import DeltaBadge from '@/components/charts/DeltaBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import { fmtYen, fmtNum, fmtPct } from '@/lib/analytics/format'
import type { AnalyticsResponse, KpiValue } from '@/lib/analytics/types'

type KpiFormat = 'yen' | 'count' | 'pct' | 'days'

export function kpiText(value: number, format: KpiFormat): string {
  switch (format) {
    case 'yen': return fmtYen(value)
    case 'pct': return fmtPct(value, 1)
    case 'days': return value.toFixed(1)
    default: return fmtNum(value)
  }
}

export function AnalyticsKpi({ label, kpi, format = 'count', unit, invert, sub }: {
  label: string
  kpi: KpiValue | undefined
  format?: KpiFormat
  unit?: string
  invert?: boolean
  sub?: string
}) {
  const value = kpi?.value ?? 0
  return (
    <div className="relative">
      <KpiCard
        label={label}
        value={kpiText(value, format)}
        unit={unit ?? (format === 'days' ? '日' : undefined)}
        sub={sub}
      />
      {kpi && kpi.compareValue !== null && (
        <div className="absolute top-3.5 right-4">
          <DeltaBadge value={value} compareValue={kpi.compareValue} invert={invert} />
        </div>
      )}
    </div>
  )
}

export function TabLoading() {
  return <div className="flex justify-center py-20"><LoadingSpinner size="lg" label="集計中..." /></div>
}

export function TabError({ message }: { message: string }) {
  return (
    <p className="text-sm text-center py-16 text-[var(--md-sys-color-error,#dc2626)]">
      データの読み込みに失敗しました（{message}）
    </p>
  )
}

export function MetaCaption({ meta }: { meta: AnalyticsResponse['meta'] }) {
  return (
    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex flex-wrap gap-x-3 gap-y-1">
      <span>集計期間: {meta.range.from} 〜 {meta.range.to}</span>
      {meta.compareRange && <span>比較期間: {meta.compareRange.from} 〜 {meta.compareRange.to}</span>}
      <span>粒度: {meta.granularity === 'day' ? '日' : meta.granularity === 'week' ? '週' : '月'}</span>
      {meta.notes?.map((n, i) => <span key={i} className="text-amber-600">※ {n}</span>)}
    </div>
  )
}
