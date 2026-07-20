'use client'

import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import StatTable from '@/components/charts/StatTable'
import { CHART_PRIMARY, CHART_COMPARE, CHART_SECONDARY } from '@/components/charts/chartColors'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'
import AiInsightCard from './AiInsightCard'
import { useExplainPoint } from './ExplainPointModal'

export default function InventoryTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('inventory', query)
  const explain = useExplainPoint('inventory', query, data?.meta)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <AiInsightCard tab="inventory" query={query} data={data} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AnalyticsKpi label="買取品目数" kpi={data.kpis.itemCount} format="count" unit="点" />
        <AnalyticsKpi label="出品数" kpi={data.kpis.listedCount} format="count" unit="点" />
        <AnalyticsKpi label="売却数" kpi={data.kpis.soldCount} format="count" unit="点" />
        <AnalyticsKpi label="売却額" kpi={data.kpis.soldAmount} format="yen" />
        <AnalyticsKpi label="粗利" kpi={data.kpis.grossProfit} format="yen" sub="売却額 − 仕入れ値" />
        <AnalyticsKpi label="平均販売日数" kpi={data.kpis.avgSellDays} format="days" sub="出品 → 売却" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="買取品目カテゴリー別金額 TOP15">
          <HBarRanking items={(data.breakdowns.itemCategories ?? []).map(b => ({ name: `${b.name}（${b.count}点）`, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
        <ChartCard title="在庫ステータス構成" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">現在のスナップショット</span>}>
          <DonutChart items={(data.breakdowns.inventoryStatus ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="売却額 vs 仕入れ原価の推移" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">クリックでAI解説</span>}>
          <TimeSeriesChart
            data={data.series.salesTrend ?? []}
            valueFormat="yen"
            series={[
              { key: 'sold', name: '売却額', color: CHART_PRIMARY },
              { key: 'cost', name: '仕入れ原価', color: CHART_COMPARE, type: 'line' },
            ]}
            onPointClick={explain.handlerFor('売却額 vs 仕入れ原価の推移')}
          />
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="粗利率の分布">
            <HBarRanking items={(data.breakdowns.marginHistogram ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
          </ChartCard>
          <ChartCard title="ブランド別売却額 TOP10">
            <HBarRanking items={(data.breakdowns.brands ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="高額買取品目 TOP20">
        <StatTable
          columns={[
            { key: 'item', label: '品名', format: 'text' },
            { key: 'category', label: 'カテゴリー', format: 'text' },
            { key: 'quantity', label: '数量', format: 'count', align: 'right' },
            { key: 'price', label: '買取単価', format: 'yen', align: 'right' },
            { key: 'createdAt', label: '登録日', format: 'date', align: 'right' },
          ]}
          rows={data.tables.topItems ?? []}
          defaultSortKey="price"
        />
      </ChartCard>

      <ChartCard title="長期滞留在庫（出品中・古い順）">
        <StatTable
          columns={[
            { key: 'item', label: '商品名', format: 'text' },
            { key: 'brand', label: 'ブランド', format: 'text' },
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'listingPrice', label: '販売価格', format: 'yen', align: 'right' },
            { key: 'costPrice', label: '仕入れ値', format: 'yen', align: 'right' },
            { key: 'daysListed', label: '出品日数', format: 'count', align: 'right' },
          ]}
          rows={data.tables.staleItems ?? []}
          defaultSortKey="daysListed"
        />
      </ChartCard>

      {explain.modal}
    </div>
  )
}
