'use client'

import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import StatTable from '@/components/charts/StatTable'
import { CHART_PRIMARY, CHART_SECONDARY } from '@/components/charts/chartColors'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'

export default function CustomersTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('customers', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AnalyticsKpi label="新規顧客" kpi={data.kpis.newCustomers} format="count" unit="人" />
        <AnalyticsKpi label="アクティブ顧客" kpi={data.kpis.activeCustomers} format="count" unit="人" sub="期間内に訪問完了のある顧客" />
        <AnalyticsKpi label="リピート率" kpi={data.kpis.repeatRate} format="pct" sub="期間内2回以上の訪問完了" />
        <AnalyticsKpi label="LINE連携率" kpi={data.kpis.lineLinkRate} format="pct" sub="LINE友だちのうち顧客紐付け済み" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="新規顧客の推移（+累計）">
          <TimeSeriesChart
            data={data.series.newCustomers ?? []}
            series={[
              { key: 'count', name: '新規顧客', color: CHART_PRIMARY, type: 'bar' },
              { key: 'cumulative', name: '累計', color: CHART_SECONDARY, type: 'line' },
            ]}
          />
        </ChartCard>
        <ChartCard title="顧客種別構成">
          <DonutChart items={(data.breakdowns.customerTypes ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="流入経路別新規顧客">
          <HBarRanking items={(data.breakdowns.leadSources ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="都道府県別顧客分布" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">担当店舗の都道府県</span>}>
          <HBarRanking items={(data.breakdowns.prefectures ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="リピート回数分布" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">期間内の訪問完了回数</span>}>
          <HBarRanking items={(data.breakdowns.repeatDistribution ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
        </ChartCard>
        <ChartCard title="訪問頻度の分布" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">新規顧客の設定値</span>}>
          <HBarRanking items={(data.breakdowns.visitFrequency ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} />
        </ChartCard>
      </div>

      <ChartCard title="期間内買取額 TOP顧客">
        <StatTable
          columns={[
            { key: 'customer', label: '顧客', format: 'text' },
            { key: 'customerType', label: '種別', format: 'text' },
            { key: 'store', label: '担当店舗', format: 'text' },
            { key: 'leadSource', label: '流入経路', format: 'text' },
            { key: 'deals', label: '成約数', format: 'count', align: 'right' },
            { key: 'amount', label: '買取金額', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.topCustomers ?? []}
          defaultSortKey="amount"
        />
      </ChartCard>
    </div>
  )
}
