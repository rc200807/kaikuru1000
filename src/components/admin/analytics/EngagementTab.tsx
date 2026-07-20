'use client'

import ChartCard from '@/components/charts/ChartCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import HBarRanking from '@/components/charts/HBarRanking'
import Heatmap from '@/components/charts/Heatmap'
import StatTable from '@/components/charts/StatTable'
import { CHART_COLORS, CHART_PRIMARY, CHART_SECONDARY } from '@/components/charts/chartColors'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'

const INQUIRY_TYPES = ['査定', '買取', '遺品整理', 'その他']
const USER_TYPES = ['顧客', '店舗', '管理', 'システム', 'パートナー']

export default function EngagementTab({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('engagement', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  const heatmapRows = (data.tables.heatmap ?? []) as { weekday: number; values: number[] }[]
  const heatmapGrid: number[][] = Array.from({ length: 7 }, (_, w) => heatmapRows.find(r => r.weekday === w)?.values ?? [])

  const accessSeriesData = data.series.accessSeries ?? []
  const accessKeys = USER_TYPES.filter(t => accessSeriesData.some(p => (p[t] as number) > 0))

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AnalyticsKpi label="問い合わせ" kpi={data.kpis.inquiries} format="count" unit="件" />
        <AnalyticsKpi label="フォーム回答" kpi={data.kpis.formSubmissions} format="count" unit="件" />
        <AnalyticsKpi label="LINE友だち（累計）" kpi={data.kpis.lineFriends} format="count" unit="人" />
        <AnalyticsKpi label="LINE連携率" kpi={data.kpis.lineLinkRate} format="pct" />
        <AnalyticsKpi label="LINE送受信" kpi={data.kpis.lineMessages} format="count" unit="件" />
        <AnalyticsKpi label="ログイン数" kpi={data.kpis.logins} format="count" unit="回" />
        <AnalyticsKpi label="お知らせ既読率" kpi={data.kpis.announcementReadRate} format="pct" sub="期間内公開分 × 稼働店舗" />
        <AnalyticsKpi label="研修動画再生（累計）" kpi={data.kpis.trainingPlays} format="count" unit="回" />
      </div>

      <ChartCard title="リードソース効果分析" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">流入経路 → 顧客獲得 → 案件 → 成約</span>}>
        <StatTable
          columns={[
            { key: 'leadSource', label: '流入経路', format: 'text' },
            { key: 'customers', label: '新規顧客', format: 'count', align: 'right' },
            { key: 'deals', label: '案件数', format: 'count', align: 'right' },
            { key: 'won', label: '成約数', format: 'count', align: 'right' },
            { key: 'cvr', label: '成約率', format: 'pct', align: 'right' },
            { key: 'amount', label: '買取金額', format: 'yen', align: 'right' },
          ]}
          rows={data.tables.leadSourceEffect ?? []}
          defaultSortKey="amount"
        />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="問い合わせ種別の推移（積み上げ）">
          <TimeSeriesChart
            data={data.series.inquirySeries ?? []}
            series={INQUIRY_TYPES.map((t, i) => ({ key: t, name: t, color: CHART_COLORS[i], type: 'bar', stackId: 'inq' }))}
          />
        </ChartCard>
        <ChartCard title="フォーム別回答数 TOP10">
          <HBarRanking items={(data.breakdowns.formTop ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="LINE送受信の推移">
          <TimeSeriesChart
            data={data.series.lineSeries ?? []}
            series={[
              { key: '受信', name: '受信', color: CHART_PRIMARY },
              { key: '送信', name: '送信', color: CHART_SECONDARY },
            ]}
          />
        </ChartCard>
        <ChartCard title="アクセス数の推移（ユーザー種別）">
          <TimeSeriesChart
            data={accessSeriesData}
            series={accessKeys.map((t, i) => ({ key: t, name: t, color: CHART_COLORS[i], type: 'bar', stackId: 'acc' }))}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="訪問の曜日×時間帯ヒートマップ" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">期間内の訪問予定</span>}>
          <Heatmap grid={heatmapGrid} hourStart={8} />
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="コミュニティ・サポート活動量">
            <HBarRanking items={(data.breakdowns.communityActivity ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} />
          </ChartCard>
          <ChartCard title="不具合報告の状況">
            <HBarRanking items={(data.breakdowns.bugReports ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
