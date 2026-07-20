'use client'

import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import FunnelSteps from '@/components/charts/FunnelSteps'
import StatTable from '@/components/charts/StatTable'
import { CHART_COLORS, CHART_SECONDARY } from '@/components/charts/chartColors'
import { DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, DEAL_STATUS_ORDER } from '@/lib/deal-status'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'

export default function DealsTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('deals', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  // ステータス別時系列の系列定義（表示ラベルがキー）
  const statusSeriesKeys = DEAL_STATUS_ORDER
    .map(s => ({ status: s, label: DEAL_STATUS_LABEL[s] ?? s }))
    .filter(({ label }) => (data.series.statusSeries ?? []).some(p => (p[label] as number) > 0))

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnalyticsKpi label="新規案件" kpi={data.kpis.dealCount} format="count" unit="件" />
        <AnalyticsKpi label="成約数" kpi={data.kpis.wonCount} format="count" unit="件" />
        <AnalyticsKpi label="成約率" kpi={data.kpis.contractRate} format="pct" />
        <AnalyticsKpi label="失注率" kpi={data.kpis.lostRate} format="pct" invert />
        <AnalyticsKpi label="平均リードタイム" kpi={data.kpis.avgLeadTime} format="days" sub="案件発生 → 契約成立" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="案件ステータスファネル" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">各ステージ到達件数</span>}>
          <FunnelSteps steps={(data.breakdowns.funnelSteps ?? []).map(b => ({ name: b.name, count: b.count ?? 0 }))} />
          {(data.breakdowns.lostBreakdown ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
              {(data.breakdowns.lostBreakdown ?? []).map(b => (
                <span key={b.name} className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'rgba(248,113,113,0.12)', color: '#ef4444' }}>
                  {b.name} {b.count}件
                </span>
              ))}
            </div>
          )}
        </ChartCard>
        <ChartCard title="ステータス別案件数の推移（積み上げ）">
          <TimeSeriesChart
            data={data.series.statusSeries ?? []}
            series={statusSeriesKeys.map(({ status, label }, i) => ({
              key: label, name: label, color: DEAL_STATUS_BADGE[status]?.fg ?? CHART_COLORS[i % CHART_COLORS.length], type: 'bar', stackId: 's',
            }))}
          />
        </ChartCard>
        <ChartCard title="流入経路別案件数">
          <HBarRanking items={(data.breakdowns.leadSources ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="案件の作成者種別">
          <DonutChart items={(data.breakdowns.createdBy ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnalyticsKpi label="訪問決定率" kpi={data.kpis.visitDecisionRate} format="pct" sub="問い合わせから訪問へ進んだ割合" />
        <AnalyticsKpi label="問い合わせ数" kpi={data.kpis.inquiryCount} format="count" unit="件" />
        <AnalyticsKpi label="問い合わせ→案件化率" kpi={data.kpis.inquiryConversion} format="pct" />
        <AnalyticsKpi label="訪問リクエスト" kpi={data.kpis.visitRequestCount} format="count" unit="件" />
        <AnalyticsKpi label="リクエスト承認率" kpi={data.kpis.visitRequestApproval} format="pct" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="問い合わせ種別">
          <DonutChart items={(data.breakdowns.inquiryTypes ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} height={180} />
        </ChartCard>
        <ChartCard title="問い合わせ対応状況">
          <DonutChart items={(data.breakdowns.inquiryStatuses ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} height={180} />
        </ChartCard>
        <ChartCard title="訪問リクエスト状況">
          <HBarRanking items={(data.breakdowns.visitRequests ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
        </ChartCard>
      </div>

      <ChartCard title="失注案件（直近20件）">
        <StatTable
          columns={[
            { key: 'customer', label: '顧客', format: 'text' },
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'category', label: 'カテゴリー', format: 'text' },
            { key: 'status', label: 'ステータス', format: 'text' },
            { key: 'leadSource', label: '流入経路', format: 'text' },
            { key: 'occurredAt', label: '発生日', format: 'date', align: 'right' },
          ]}
          rows={data.tables.lostDeals ?? []}
        />
      </ChartCard>
    </div>
  )
}
