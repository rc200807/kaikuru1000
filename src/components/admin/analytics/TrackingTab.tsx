'use client'

// アクセス解析タブ: 外部集客サイトのクロスドメイン計測（GA相当の統計 + 経路探索 + 案件掛け合わせ）
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ChartCard from '@/components/charts/ChartCard'
import KpiCard from '@/components/charts/KpiCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import Heatmap from '@/components/charts/Heatmap'
import StatTable from '@/components/charts/StatTable'
import FunnelSteps from '@/components/charts/FunnelSteps'
import PathFlowChart from '@/components/charts/PathFlowChart'
import { CHART_PRIMARY, CHART_SECONDARY, CHART_COLORS } from '@/components/charts/chartColors'
import { fmtNum, fmtPct, fmtYen } from '@/lib/analytics/format'
import type { AnalyticsFilterOptions } from '@/lib/analytics/types'
import type { PathFlowResult, PageStatRow, TrackingVisitorRow, DealResultsData, RealtimeData } from '@/lib/tracking-types'
import { useAnalyticsData } from './useAnalyticsData'
import { AnalyticsKpi, TabLoading, TabError, MetaCaption } from './shared'
import AiInsightCard from './AiInsightCard'
import TrackingSettingsSections from './TrackingSettings'

const SECTIONS = [
  { key: 'overview', label: '概要' },
  { key: 'paths', label: '経路探索' },
  { key: 'pages', label: 'ページ分析' },
  { key: 'visitors', label: 'ユーザー' },
  { key: 'params', label: 'パラメータ・キャンペーン' },
  { key: 'results', label: '成果分析' },
  { key: 'settings', label: '設定' },
] as const
type SectionKey = typeof SECTIONS[number]['key']

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

/* ─── 概要（GA標準レポート相当） ─── */

function RealtimeCard() {
  const [data, setData] = useState<RealtimeData | null>(null)
  useEffect(() => {
    let stop = false
    const load = () => {
      fetch('/api/admin/tracking/realtime')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (!stop && d) setData(d) })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { stop = true; clearInterval(timer) }
  }, [])

  return (
    <ChartCard title="🔴 リアルタイム" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">直近30分・30秒ごとに更新</span>}>
      {!data ? (
        <p className="text-xs py-4 text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{data.activeVisitors}</span>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">人がアクティブ</span>
          </div>
          {data.activePages.length > 0 && (
            <div className="space-y-1">
              {data.activePages.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate text-[var(--md-sys-color-on-surface)]" title={p.path}>{p.title || p.path}</span>
                  <span className="ml-auto tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  )
}

function OverviewSection({ query }: { query: string }) {
  const { data, loading, error } = useAnalyticsData('tracking', query)
  if (loading) return <TabLoading />
  if (error || !data) return <TabError message={error ?? 'no data'} />

  const heatmapRows = (data.tables.heatmap ?? []) as { weekday: number; values: number[] }[]
  const heatmapGrid: number[][] = Array.from({ length: 7 }, (_, w) => heatmapRows.find(r => r.weekday === w)?.values ?? [])
  const avgSec = data.kpis.avgSessionSec?.value ?? 0

  return (
    <div className="space-y-4">
      <MetaCaption meta={data.meta} />
      <AiInsightCard tab="tracking" query={query} data={data} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnalyticsKpi label="訪問者数" kpi={data.kpis.visitors} format="count" unit="人" />
        <AnalyticsKpi label="セッション" kpi={data.kpis.sessions} format="count" unit="件" />
        <AnalyticsKpi label="ページビュー" kpi={data.kpis.pageviews} format="count" unit="PV" />
        <AnalyticsKpi label="直帰率" kpi={data.kpis.bounceRate} format="pct" invert />
        <KpiCard label="平均セッション時間" value={fmtDuration(avgSec)} />
        <KpiCard label="セッションあたりPV" value={(data.kpis.pvPerSession?.value ?? 0).toFixed(1)} unit="PV" />
        <AnalyticsKpi label="新規訪問率" kpi={data.kpis.newRate} format="pct" />
        <AnalyticsKpi label="コンバージョン" kpi={data.kpis.conversions} format="count" unit="件" />
        <AnalyticsKpi label="CVR（セッション）" kpi={data.kpis.cvr} format="pct" />
        <KpiCard
          label="CV内訳"
          value={`${fmtNum(data.kpis.cvInquiry?.value ?? 0)} / ${fmtNum(data.kpis.cvForm?.value ?? 0)} / ${fmtNum(data.kpis.cvButton?.value ?? 0)}`}
          sub="問い合わせ / フォーム / ボタン"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title="アクセス推移">
            <TimeSeriesChart
              data={data.series.traffic ?? []}
              height={230}
              series={[
                { key: 'sessions', name: 'セッション', color: CHART_PRIMARY, type: 'bar' },
                { key: 'visitors', name: '訪問者', color: CHART_SECONDARY, type: 'line' },
                { key: 'cv', name: 'CV', color: '#f59e0b', type: 'line' },
              ]}
            />
          </ChartCard>
        </div>
        <RealtimeCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="チャネル別セッション">
          <DonutChart items={(data.breakdowns.channels ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} height={180} />
        </ChartCard>
        <ChartCard title="デバイス別">
          <DonutChart items={(data.breakdowns.devices ?? []).map(b => ({ name: b.name === 'mobile' ? 'モバイル' : b.name === 'tablet' ? 'タブレット' : b.name === 'desktop' ? 'PC' : b.name, value: b.count ?? 0 }))} height={180} />
        </ChartCard>
        <ChartCard title="ブラウザ / OS">
          <div className="grid grid-cols-2 gap-3">
            <HBarRanking items={(data.breakdowns.browsers ?? []).slice(0, 5).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} />
            <HBarRanking items={(data.breakdowns.os ?? []).slice(0, 5).map(b => ({ name: b.name, value: b.count ?? 0 }))} showRank={false} color={CHART_SECONDARY} />
          </div>
        </ChartCard>
        <ChartCard title="流入元ドメイン TOP">
          <HBarRanking items={(data.breakdowns.referrers ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="ランディングページ TOP">
          <HBarRanking items={(data.breakdowns.landings ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="離脱ページ TOP">
          <HBarRanking items={(data.breakdowns.exits ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} color="#f87171" />
        </ChartCard>
        <ChartCard title="地域（都道府県）">
          <HBarRanking items={(data.breakdowns.regions ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="地域（市区町村）">
          <HBarRanking items={(data.breakdowns.cities ?? []).map(b => ({ name: b.name, value: b.count ?? 0 }))} />
        </ChartCard>
        <ChartCard title="最新コンバージョン">
          {(data.tables.cvFeed ?? []).length === 0 ? (
            <p className="text-xs py-4 text-center text-[var(--md-sys-color-on-surface-variant)]">まだCVがありません</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {(data.tables.cvFeed ?? []).map((f: any, i: number) => (
                <div key={i} className="text-[11px] flex items-center gap-2">
                  <span className="text-sm">🎉</span>
                  <div className="min-w-0">
                    <p className="text-[var(--md-sys-color-on-surface)] truncate">{f.type}{f.store !== '—' ? `（${f.store}）` : ''}</p>
                    <p className="text-[var(--md-sys-color-on-surface-variant)]">
                      {f.channel} ・ {f.referrer} ・ {new Date(f.occurredAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="曜日×時間帯アクセスヒートマップ" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">セッション開始時刻（JST）</span>}>
        <Heatmap grid={heatmapGrid} hourStart={0} />
      </ChartCard>
    </div>
  )
}

/* ─── 経路探索 ─── */

function PathsSection({ query }: { query: string }) {
  const [data, setData] = useState<PathFlowResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [cvOnly, setCvOnly] = useState(false)
  const [reverse, setReverse] = useState(false)
  const [wonOnly, setWonOnly] = useState(false)
  const [channel, setChannel] = useState('')
  const [storeId, setStoreId] = useState('')
  const [stores, setStores] = useState<AnalyticsFilterOptions['stores']>([])

  useEffect(() => {
    fetch('/api/admin/analytics/filters').then(r => r.ok ? r.json() : null).then(d => { if (d?.stores) setStores(d.stores) }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams(query)
    if (cvOnly) qs.set('cvOnly', '1')
    if (reverse) qs.set('reverse', '1')
    if (wonOnly) qs.set('outcome', 'won')
    if (channel) qs.set('channel', channel)
    if (storeId) qs.set('storeId', storeId)
    fetch(`/api/admin/tracking/paths?${qs.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [query, cvOnly, reverse, wonOnly, channel, storeId])

  useEffect(() => { load() }, [load])

  const toggleClass = (on: boolean) =>
    `text-xs px-2.5 py-1.5 rounded-full transition-colors ${on
      ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold'
      : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]'}`

  return (
    <ChartCard
      title="経路探索"
      aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{data ? `${data.totalSessions.toLocaleString()}セッション${data.truncated ? '（直近分に切詰め）' : ''}` : ''}</span>}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setCvOnly(v => !v)} className={toggleClass(cvOnly)}>CV到達のみ</button>
        <button onClick={() => { setReverse(v => !v) }} className={toggleClass(reverse)}>終点から遡る</button>
        <button onClick={() => setWonOnly(v => !v)} className={toggleClass(wonOnly)}>成約に至った経路のみ</button>
        <select value={channel} onChange={e => setChannel(e.target.value)} className="text-xs rounded-lg px-2 py-1.5 border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)]">
          <option value="">全チャネル</option>
          <option value="search">検索</option>
          <option value="social">SNS</option>
          <option value="ad">広告</option>
          <option value="referral">参照サイト</option>
          <option value="direct">直接</option>
        </select>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} className="text-xs rounded-lg px-2 py-1.5 border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)] max-w-[180px]">
          <option value="">全店舗（問い合わせ先）</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {loading ? (
        <p className="text-xs py-10 text-center text-[var(--md-sys-color-on-surface-variant)]">経路を集計中…</p>
      ) : data ? (
        <PathFlowChart data={data} />
      ) : (
        <p className="text-xs py-10 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込みに失敗しました</p>
      )}
      {reverse && <p className="text-[10px] mt-2 text-[var(--md-sys-color-on-surface-variant)]">※ 終点モード: ステップ+1 = CV直前に見ていたページ、+2 = その1つ前…と遡って表示しています</p>}
    </ChartCard>
  )
}

/* ─── ページ分析 ─── */

function PagesSection({ query }: { query: string }) {
  const [rows, setRows] = useState<PageStatRow[] | null>(null)
  useEffect(() => {
    setRows(null)
    fetch(`/api/admin/tracking/pages?${query}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setRows(d?.pages ?? []))
      .catch(() => setRows([]))
  }, [query])

  if (rows === null) return <TabLoading />
  return (
    <ChartCard title="ページ別パフォーマンス" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">CV寄与率 = そのページを経由したセッションのCVR</span>}>
      <StatTable
        columns={[
          { key: 'page', label: 'ページ', format: 'text' },
          { key: 'pv', label: 'PV', format: 'count', align: 'right' },
          { key: 'sessions', label: 'セッション', format: 'count', align: 'right' },
          { key: 'avgDurationLabel', label: '平均滞在', format: 'text', align: 'right' },
          { key: 'avgScrollLabel', label: '平均スクロール', format: 'text', align: 'right' },
          { key: 'exitRate', label: '離脱率', format: 'pct', align: 'right' },
          { key: 'cvContribution', label: 'CV寄与率', format: 'pct', align: 'right' },
        ]}
        rows={rows.map(r => ({
          page: r.title || r.path,
          pv: r.pv,
          sessions: r.sessions,
          avgDurationLabel: r.avgDuration !== null ? fmtDuration(r.avgDuration) : '—',
          avgScrollLabel: r.avgScroll !== null ? `${Math.round(r.avgScroll)}%` : '—',
          exitRate: r.exitRate,
          cvContribution: r.cvContribution,
        }))}
        defaultSortKey="pv"
        maxRows={50}
      />
    </ChartCard>
  )
}

/* ─── ユーザー（訪問者一覧） ─── */

function VisitorsSection({ query }: { query: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<TrackingVisitorRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [cvOnly, setCvOnly] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page) })
    if (cvOnly) qs.set('cvOnly', '1')
    if (q) qs.set('q', q)
    fetch(`/api/admin/tracking/visitors?${qs.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRows(d.visitors); setTotal(d.total) } })
      .catch(() => setRows([]))
  }, [page, cvOnly, q, query])

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <ChartCard title="訪問者一覧" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">全 {total.toLocaleString()} 人（行クリックで詳細）</span>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
          placeholder="顧客名・URLで検索…"
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)] w-56"
        />
        <button
          onClick={() => { setCvOnly(v => !v); setPage(1) }}
          className={`text-xs px-2.5 py-1.5 rounded-full ${cvOnly ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold' : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]'}`}
        >
          CVありのみ
        </button>
      </div>
      {rows === null ? (
        <p className="text-xs py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">訪問者がまだ記録されていません</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                <th className="text-left py-2 px-1.5">最終訪問</th>
                <th className="text-left py-2 px-1.5">初回流入元</th>
                <th className="text-left py-2 px-1.5">チャネル</th>
                <th className="text-left py-2 px-1.5">デバイス</th>
                <th className="text-left py-2 px-1.5">地域</th>
                <th className="text-right py-2 px-1.5">訪問</th>
                <th className="text-right py-2 px-1.5">CV</th>
                <th className="text-left py-2 px-1.5">顧客</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(v => (
                <tr
                  key={v.id}
                  onClick={() => router.push(`/admin/analytics/visitors/${v.id}`)}
                  className="border-b border-[var(--md-sys-color-outline-variant)] last:border-0 cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high,#f7f7f7)]"
                >
                  <td className="py-2 px-1.5 whitespace-nowrap tabular-nums text-[var(--md-sys-color-on-surface)]">{fmtDate(v.lastSeenAt)}</td>
                  <td className="py-2 px-1.5 max-w-[180px] truncate text-[var(--md-sys-color-on-surface-variant)]" title={v.firstReferrer ?? ''}>{v.firstReferrer ? (() => { try { return new URL(v.firstReferrer!).hostname } catch { return v.firstReferrer } })() : '直接'}</td>
                  <td className="py-2 px-1.5 text-[var(--md-sys-color-on-surface)]">{v.channel === 'search' ? '検索' : v.channel === 'social' ? 'SNS' : v.channel === 'ad' ? '広告' : v.channel === 'referral' ? '参照' : v.channel === 'direct' ? '直接' : '—'}</td>
                  <td className="py-2 px-1.5 text-[var(--md-sys-color-on-surface)]">{v.deviceType === 'mobile' ? '📱' : v.deviceType === 'tablet' ? '📱T' : v.deviceType === 'desktop' ? '💻' : '—'}</td>
                  <td className="py-2 px-1.5 text-[var(--md-sys-color-on-surface)]">{v.region ?? '—'}</td>
                  <td className="py-2 px-1.5 text-right tabular-nums text-[var(--md-sys-color-on-surface)]">{v.sessionCount}</td>
                  <td className="py-2 px-1.5 text-right tabular-nums">
                    {v.conversionCount > 0
                      ? <span className="font-bold" style={{ color: '#22c55e' }}>{v.conversionCount}</span>
                      : <span className="text-[var(--md-sys-color-on-surface-variant)]">0</span>}
                  </td>
                  <td className="py-2 px-1.5 text-[var(--md-sys-color-on-surface)]">{v.customerName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 50 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] disabled:opacity-40 text-[var(--md-sys-color-on-surface)]">前へ</button>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{page} / {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] disabled:opacity-40 text-[var(--md-sys-color-on-surface)]">次へ</button>
        </div>
      )}
    </ChartCard>
  )
}

/* ─── 成果分析（案件データとの掛け合わせ） ─── */

function ResultsSection({ query }: { query: string }) {
  const [data, setData] = useState<DealResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/tracking/deal-results?${query}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [query])

  if (loading) return <TabLoading />
  if (!data) return <TabError message="読み込みに失敗しました" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="フルファネル（セッション → 成約）" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">成約金額 {fmtYen(data.totalAmount)}</span>}>
          <FunnelSteps steps={data.funnel} />
        </ChartCard>
        <ChartCard title="リードタイム（チャネル別・初回訪問からの日数）">
          <StatTable
            columns={[
              { key: 'channel', label: 'チャネル', format: 'text' },
              { key: 'count', label: '問い合わせ', format: 'count', align: 'right' },
              { key: 'toInquiry', label: '→問い合わせ', format: 'text', align: 'right' },
              { key: 'toWon', label: '→成約', format: 'text', align: 'right' },
            ]}
            rows={data.leadTimes.map(l => ({
              channel: l.channel,
              count: l.count,
              toInquiry: l.avgDaysToInquiry !== null ? `${l.avgDaysToInquiry}日` : '—',
              toWon: l.avgDaysToWon !== null ? `${l.avgDaysToWon}日` : '—',
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard title="チャネル×案件成果" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">どの流入が売上に貢献しているか</span>}>
        <StatTable
          columns={[
            { key: 'channel', label: 'チャネル', format: 'text' },
            { key: 'sessions', label: 'セッション', format: 'count', align: 'right' },
            { key: 'inquiries', label: '問い合わせ', format: 'count', align: 'right' },
            { key: 'deals', label: '案件化', format: 'count', align: 'right' },
            { key: 'won', label: '成約', format: 'count', align: 'right' },
            { key: 'amount', label: '買取金額', format: 'yen', align: 'right' },
          ]}
          rows={data.channelResults}
          defaultSortKey="amount"
        />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="ランディングページ別の案件品質">
          <StatTable
            columns={[
              { key: 'path', label: 'LP', format: 'text' },
              { key: 'inquiries', label: '問い合わせ', format: 'count', align: 'right' },
              { key: 'deals', label: '案件化', format: 'count', align: 'right' },
              { key: 'won', label: '成約', format: 'count', align: 'right' },
              { key: 'amount', label: '金額', format: 'yen', align: 'right' },
            ]}
            rows={data.landingResults}
            defaultSortKey="inquiries"
          />
        </ChartCard>
        <ChartCard title="キャンペーン×売上（発行URL成果）">
          {data.campaignResults.length === 0 ? (
            <p className="text-xs py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">キャンペーンURLが未発行です（「パラメータ・キャンペーン」で発行できます）</p>
          ) : (
            <StatTable
              columns={[
                { key: 'name', label: 'キャンペーン', format: 'text' },
                { key: 'sessions', label: 'セッション', format: 'count', align: 'right' },
                { key: 'conversions', label: 'CV', format: 'count', align: 'right' },
                { key: 'won', label: '成約', format: 'count', align: 'right' },
                { key: 'amount', label: '金額', format: 'yen', align: 'right' },
              ]}
              rows={data.campaignResults}
              defaultSortKey="amount"
            />
          )}
        </ChartCard>
      </div>

      <ChartCard title="店舗別サマリー（問い合わせ先ベース）">
        <StatTable
          columns={[
            { key: 'store', label: '店舗', format: 'text' },
            { key: 'conversions', label: '問い合わせCV', format: 'count', align: 'right' },
            { key: 'topChannel', label: '主要チャネル', format: 'text' },
            { key: 'deals', label: '案件化', format: 'count', align: 'right' },
            { key: 'won', label: '成約', format: 'count', align: 'right' },
            { key: 'amount', label: '買取金額', format: 'yen', align: 'right' },
          ]}
          rows={data.storeResults.map(s => ({ ...s, topChannel: s.topChannel ?? '—' }))}
          defaultSortKey="conversions"
        />
      </ChartCard>
    </div>
  )
}

/* ─── タブ本体 ─── */

export default function TrackingTab({ query }: { query: string }) {
  const [section, setSection] = useState<SectionKey>('overview')

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              section === s.key
                ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold'
                : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'overview' && <OverviewSection query={query} />}
      {section === 'paths' && <PathsSection query={query} />}
      {section === 'pages' && <PagesSection query={query} />}
      {section === 'visitors' && <VisitorsSection query={query} />}
      {(section === 'params' || section === 'settings') && <TrackingSettingsSections section={section} query={query} />}
      {section === 'results' && <ResultsSection query={query} />}
    </div>
  )
}
