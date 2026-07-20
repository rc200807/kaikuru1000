'use client'

import ChartCard from '@/components/charts/ChartCard'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import StatTable from '@/components/charts/StatTable'
import { CHART_SECONDARY } from '@/components/charts/chartColors'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'
import AiInsightCard from './AiInsightCard'
import StoreDiagnosisCard from './StoreDiagnosisCard'

export default function StoresTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('stores', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <AiInsightCard tab="stores" query={query} data={data} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AnalyticsKpi label="稼働店舗数" kpi={data.kpis.activeStores} format="count" unit="店舗" />
        <AnalyticsKpi label="期間内新規開業" kpi={data.kpis.newOpenings} format="count" unit="店舗" />
        <AnalyticsKpi label="実績のある店舗" kpi={data.kpis.storesWithDeals} format="count" unit="店舗" sub="期間内に案件のあった店舗" />
        <AnalyticsKpi label="店舗あたり平均買取額" kpi={data.kpis.avgPerStore} format="yen" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="店舗別買取金額 TOP20">
          <HBarRanking items={(data.breakdowns.storeTop ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
        <ChartCard title="都道府県別買取金額">
          <HBarRanking items={(data.breakdowns.prefectures ?? []).map(b => ({ name: `${b.name}（${b.count}店舗）`, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
        <ChartCard title="運営者別実績">
          <HBarRanking items={(data.breakdowns.operatorPerf ?? []).map(b => ({ name: b.name, value: b.amount ?? 0 }))} valueFormat="yen" />
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="運営者の形態">
            <DonutChart items={(data.breakdowns.entityTypes ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} height={140} />
          </ChartCard>
          <ChartCard title="店舗別研修動画視聴 TOP10" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">累計再生回数</span>}>
            <HBarRanking items={(data.breakdowns.trainingTop ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} color={CHART_SECONDARY} />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="スタッフ別実績 TOP20" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">期間内の訪問完了ベース</span>}>
        <StatTable
          columns={[
            { key: 'name', label: 'スタッフ', format: 'text' },
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'count', label: '訪問完了', format: 'count', align: 'right' },
            { key: 'amount', label: '買取金額', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.staffPerf ?? []}
          defaultSortKey="amount"
        />
      </ChartCard>

      <ChartCard title="店舗パフォーマンス一覧" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">列見出しクリックでソート</span>}>
        <StatTable
          columns={[
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'prefecture', label: '都道府県', format: 'text' },
            { key: 'operator', label: '運営者', format: 'text' },
            { key: 'customers', label: '新規顧客', format: 'count', align: 'right' },
            { key: 'visits', label: '訪問完了', format: 'count', align: 'right' },
            { key: 'deals', label: '案件数', format: 'count', align: 'right' },
            { key: 'won', label: '成約数', format: 'count', align: 'right' },
            { key: 'contractRate', label: '成約率', format: 'pct', align: 'right' },
            { key: 'purchase', label: '買取金額', format: 'yen', align: 'right' },
            { key: 'billing', label: '請求金額', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.storePerformance ?? []}
          defaultSortKey="purchase"
          maxRows={50}
        />
      </ChartCard>

      <StoreDiagnosisCard query={query} />
    </div>
  )
}
