'use client'

import { useState } from 'react'
import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart, { ChartAnnotation } from '@/components/charts/TimeSeriesChart'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import StatTable from '@/components/charts/StatTable'
import { CHART_PRIMARY, CHART_SECONDARY, CHART_COMPARE } from '@/components/charts/chartColors'
import type { AnomaliesResult } from '@/lib/analytics/types'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption, kpiText } from './shared'
import AiInsightCard from './AiInsightCard'
import AiForecastCard from './AiForecastCard'
import AiAnomaliesCard from './AiAnomaliesCard'
import { useExplainPoint } from './ExplainPointModal'

export default function OverviewTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('overview', query)
  const [anomalies, setAnomalies] = useState<AnomaliesResult | null>(null)
  const explain = useExplainPoint('overview', query, data?.meta)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  const annotationsFor = (keys: string[]): ChartAnnotation[] =>
    (anomalies?.annotations ?? [])
      .filter(a => keys.includes(a.seriesKey))
      .map(a => ({ label: a.label, value: a.value, direction: a.direction }))

  const hasCompare = data.meta.compareRange !== null
  const kpiDefs = [
    { key: 'purchaseAmount', label: '買取金額', format: 'yen' as const },
    { key: 'billingAmount', label: '請求金額', format: 'yen' as const },
    { key: 'dealCount', label: '新規案件', format: 'count' as const, unit: '件' },
    { key: 'contractRate', label: '成約率', format: 'pct' as const },
    { key: 'newCustomers', label: '新規顧客', format: 'count' as const, unit: '人' },
    { key: 'completedVisits', label: '訪問完了', format: 'count' as const, unit: '件' },
    { key: 'inquiries', label: '問い合わせ', format: 'count' as const, unit: '件' },
    { key: 'deliveryAmount', label: '宅配買取金額', format: 'yen' as const },
  ]

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <AiInsightCard tab="overview" query={query} data={data} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiDefs.map(def => (
          <AnalyticsKpi key={def.key} label={def.label} kpi={data.kpis[def.key]} format={def.format} unit={def.unit} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AiForecastCard query={query} />
        <AiAnomaliesCard tab="overview" query={query} data={data} onAnnotations={setAnomalies} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="買取・請求金額の推移" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">クリックでAI解説</span>}>
          <TimeSeriesChart
            data={data.series.amounts ?? []}
            valueFormat="yen"
            series={[
              { key: 'purchase', name: '買取金額', color: CHART_PRIMARY },
              { key: 'billing', name: '請求金額', color: CHART_SECONDARY },
              ...(hasCompare ? [{ key: 'prevPurchase', name: '買取金額（比較期間）', color: CHART_COMPARE, dashed: true }] : []),
            ]}
            annotations={annotationsFor(['purchase', 'billing'])}
            onPointClick={explain.handlerFor('買取・請求金額の推移')}
          />
        </ChartCard>
        <ChartCard title="案件・新規顧客数の推移" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">クリックでAI解説</span>}>
          <TimeSeriesChart
            data={data.series.counts ?? []}
            series={[
              { key: 'deals', name: '案件数', color: CHART_PRIMARY, type: 'bar' },
              { key: 'customers', name: '新規顧客', color: CHART_SECONDARY, type: 'line' },
              ...(hasCompare ? [{ key: 'prevDeals', name: '案件数（比較期間）', color: CHART_COMPARE, dashed: true }] : []),
            ]}
            annotations={annotationsFor(['deals', 'customers'])}
            onPointClick={explain.handlerFor('案件・新規顧客数の推移')}
          />
        </ChartCard>
        <ChartCard title="案件カテゴリー構成（件数）">
          <DonutChart items={(data.breakdowns.dealCategory ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="チャネル別買取金額">
          <DonutChart items={(data.breakdowns.channel ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
      </div>

      <ChartCard title="店舗別買取金額 TOP10">
        <HBarRanking items={(data.breakdowns.storeTop ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
      </ChartCard>

      {hasCompare && (
        <ChartCard title="主要指標の期間比較">
          <StatTable
            columns={[
              { key: 'label', label: '指標', format: 'text', sortable: false },
              { key: 'current', label: '当期間', align: 'right', format: 'text', sortable: false },
              { key: 'previous', label: '比較期間', align: 'right', format: 'text', sortable: false },
              { key: 'delta', label: '増減', align: 'right', format: 'text', sortable: false },
            ]}
            rows={kpiDefs.map(def => {
              const kpi = data.kpis[def.key]
              const prev = kpi?.compareValue
              const delta = prev != null && prev !== 0 ? `${(((kpi.value - prev) / Math.abs(prev)) * 100).toFixed(1)}%` : '—'
              return {
                label: def.label,
                current: kpiText(kpi?.value ?? 0, def.format),
                previous: prev != null ? kpiText(prev, def.format) : '—',
                delta,
              }
            })}
          />
        </ChartCard>
      )}

      {explain.modal}
    </div>
  )
}
