'use client'

import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import HBarRanking from '@/components/charts/HBarRanking'
import FunnelSteps from '@/components/charts/FunnelSteps'
import StatTable from '@/components/charts/StatTable'
import { CHART_PRIMARY, CHART_SECONDARY, CHART_COLORS } from '@/components/charts/chartColors'
import { DEAL_CATEGORY_LABEL, DEAL_CATEGORIES } from '@/lib/deal-categories'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'

export default function SalesTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('sales', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AnalyticsKpi label="買取金額" kpi={data.kpis.purchaseAmount} format="yen" />
        <AnalyticsKpi label="請求金額" kpi={data.kpis.billingAmount} format="yen" />
        <AnalyticsKpi label="平均案件単価" kpi={data.kpis.avgDealAmount} format="yen" />
        <AnalyticsKpi label="見積→契約転換率" kpi={data.kpis.estimateConversion} format="pct" />
        <AnalyticsKpi label="上乗せ適用率" kpi={data.kpis.upliftRate} format="pct" sub="キャンペーン上乗せありの成約" />
        <AnalyticsKpi label="買取品目数" kpi={data.kpis.itemCount} format="count" unit="点" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="買取 vs 請求金額">
          <TimeSeriesChart
            data={data.series.amounts ?? []}
            valueFormat="yen"
            series={[
              { key: 'purchase', name: '買取', color: CHART_PRIMARY, type: 'bar', stackId: 'a' },
              { key: 'billing', name: '請求', color: CHART_SECONDARY, type: 'bar', stackId: 'a' },
            ]}
          />
        </ChartCard>
        <ChartCard title="案件カテゴリー別買取金額（積み上げ）">
          <TimeSeriesChart
            data={data.series.categoryAmounts ?? []}
            valueFormat="yen"
            series={DEAL_CATEGORIES.map((c, i) => ({
              key: c, name: DEAL_CATEGORY_LABEL[c], color: CHART_COLORS[i], stackId: 'cat',
            }))}
          />
        </ChartCard>
        <ChartCard title="買取品目カテゴリー別金額 TOP15">
          <HBarRanking items={(data.breakdowns.itemCategories ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
        <ChartCard title="成約案件の金額帯分布">
          <HBarRanking items={(data.breakdowns.histogram ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
        </ChartCard>
        <ChartCard title="宅配買取ステータス">
          <FunnelSteps steps={(data.breakdowns.deliveryFunnel ?? []).map(b => ({ name: b.name, count: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="宅配買取 月次査定金額">
          <TimeSeriesChart
            data={data.series.deliveryMonthly ?? []}
            valueFormat="yen"
            series={[{ key: 'amount', name: '査定金額', color: CHART_PRIMARY, type: 'bar' }]}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <ChartCard title="高額案件 TOP20">
        <StatTable
          columns={[
            { key: 'customer', label: '顧客', format: 'text' },
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'category', label: 'カテゴリー', format: 'text' },
            { key: 'occurredAt', label: '発生日', format: 'date', align: 'right' },
            { key: 'purchase', label: '買取金額', format: 'yen', align: 'right' },
            { key: 'billing', label: '請求金額', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.topDeals ?? []}
          defaultSortKey="purchase"
        />
      </ChartCard>

      <ChartCard title="店舗別売上">
        <StatTable
          columns={[
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'deals', label: '案件数', format: 'count', align: 'right' },
            { key: 'won', label: '成約数', format: 'count', align: 'right' },
            { key: 'contractRate', label: '成約率', format: 'pct', align: 'right' },
            { key: 'purchase', label: '買取金額', format: 'yen', align: 'right' },
            { key: 'billing', label: '請求金額', format: 'yen', align: 'right' },
            { key: 'avg', label: '平均単価', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.storeSales ?? []}
          defaultSortKey="purchase"
          maxRows={30}
        />
      </ChartCard>
    </div>
  )
}
