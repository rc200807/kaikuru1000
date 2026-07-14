'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import StorePage from '@/components/store/StorePage'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import { DEAL_STATUS_LABEL, DEAL_STATUS_BADGE } from '@/lib/deal-status'

// ── Types ────────────────────────────────────────────────────────────────────

type DashboardData = {
  myRank: number | null
  totalStores: number
  top10: { rank: number; name: string; isMe: boolean; ratio: number }[]
  currentMonthAmount: number
  currentMonthVisitCount: number
  currentMonthCompletedCount: number
  monthlyPurchaseAmount: { month: string; amount: number }[]
  monthlyVisits: { month: string; count: number }[]
  todayCases: {
    id: string
    customerName: string
    address: string
    phone: string
    status: string
    note: string | null
    purchaseAmount: number | null
  }[]
  // 追加指標
  prevMonthAmount?: number
  prevMonthVisitCount?: number
  monthlyDeals?: { month: string; count: number }[]
  currentMonthDealCount?: number
  prevMonthDealCount?: number
  dealStatusBreakdown?: { status: string; count: number }[]
  totalDeals?: number
  contractRate?: number
  leadSourceBreakdown?: { name: string; count: number }[]
  repeatRate?: number
  repeatCustomers?: number
  customersWithPurchase?: number
}

// 流入経路の円グラフ配色
const LEAD_COLORS = ['#b91c1c', '#60a5fa', '#22c55e', '#fbbf24', '#a78bfa', '#2dd4bf', '#f472b6', '#94a3b8']

// 前月比（%）。前月が0なら算出不可で null。
function momPct(cur: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

// ── Constants ────────────────────────────────────────────────────────────────
// チャート系列はブランドアクセント（赤）。グリッド/目盛は faint グレー。
const ACCENT = '#b91c1c'
const GRID = '#e5e5e5'
const TICK = '#a3a3a3'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtYen(n: number) {
  if (n >= 100_000_000) return `¥${(n / 100_000_000).toFixed(1)}億`
  if (n >= 10_000) return `¥${Math.round(n / 10_000).toLocaleString()}万`
  return `¥${n.toLocaleString()}`
}

function yenAxis(v: number) {
  if (v >= 1_000_000) return `${(v / 10_000).toFixed(0)}万`
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`
  return `${v}`
}

// ── Reusable UI ──────────────────────────────────────────────────────────────

type KpiProps = {
  label: string
  value: string
  unit?: string
  sub?: string
  icon: React.ReactNode
  deltaPct?: number | null
}

function KpiCard({ label, value, unit, sub, icon, deltaPct }: KpiProps) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null
  const up = (deltaPct ?? 0) >= 0
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-1)]">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-normal text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
        <span className="text-[var(--md-sys-color-on-surface-faint)]">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-[var(--md-sys-color-on-surface)]">{value}</span>
        {unit && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{unit}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {hasDelta && (
          <span className={`inline-flex items-center text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? '▲' : '▼'} 前月比 {up ? '+' : ''}{deltaPct}%
          </span>
        )}
        {deltaPct === null && <span className="text-[11px] text-[var(--md-sys-color-on-surface-faint)]">前月比 —</span>}
        {sub && <span className="text-[11px] text-[var(--md-sys-color-on-surface-faint)]">{sub}</span>}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-3)]">
      <p className="mb-1 text-[var(--md-sys-color-on-surface-variant)]">{label}</p>
      <p className="font-semibold text-sm text-[var(--md-sys-color-on-surface)]">
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{children}</h2>
    </div>
  )
}

function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 min-w-0 bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-1)] ${className}`}>
      {children}
    </div>
  )
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-3xl font-semibold text-[var(--md-sys-color-on-surface-faint)]">--</span>
        <span className="text-[10px] mt-1 text-[var(--md-sys-color-on-surface-faint)]">ランク外</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl font-semibold text-[var(--md-sys-color-on-surface)]">{rank}</span>
      <span className="text-[10px] mt-1 text-[var(--md-sys-color-on-surface-variant)]">位</span>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function StoreDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as any
    if (user.role !== 'store') { router.push('/'); return }
    fetch('/api/store/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [status, session, router])

  if (loading || !data) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const {
    myRank, totalStores, top10,
    currentMonthAmount, currentMonthVisitCount, currentMonthCompletedCount,
    monthlyPurchaseAmount, monthlyVisits, todayCases,
  } = data

  const prevMonthAmount = data.prevMonthAmount ?? 0
  const prevMonthVisitCount = data.prevMonthVisitCount ?? 0
  const monthlyDeals = data.monthlyDeals ?? []
  const currentMonthDealCount = data.currentMonthDealCount ?? 0
  const prevMonthDealCount = data.prevMonthDealCount ?? 0
  const dealStatusBreakdown = data.dealStatusBreakdown ?? []
  const totalDeals = data.totalDeals ?? 0
  const contractRate = data.contractRate ?? 0
  const leadSourceBreakdown = data.leadSourceBreakdown ?? []
  const repeatRate = data.repeatRate ?? 0
  const repeatCustomers = data.repeatCustomers ?? 0
  const customersWithPurchase = data.customersWithPurchase ?? 0

  // 円グラフ用データ
  const statusPie = dealStatusBreakdown
    .filter(g => g.count > 0)
    .map(g => ({ name: DEAL_STATUS_LABEL[g.status] ?? g.status, value: g.count, color: DEAL_STATUS_BADGE[g.status]?.fg ?? '#94a3b8' }))
  const leadPie = leadSourceBreakdown
    .filter(g => g.count > 0)
    .map((g, i) => ({ name: g.name, value: g.count, color: LEAD_COLORS[i % LEAD_COLORS.length] }))

  const storeName = (session?.user as any)?.name ?? '店舗'

  const kpiCards: KpiProps[] = [
    {
      label: '当月買取金額',
      value: fmtYen(currentMonthAmount),
      deltaPct: momPct(currentMonthAmount, prevMonthAmount),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: '当月訪問件数',
      value: currentMonthVisitCount.toLocaleString(),
      unit: '件',
      sub: `完了 ${currentMonthCompletedCount}件`,
      deltaPct: momPct(currentMonthVisitCount, prevMonthVisitCount),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
    },
    {
      label: '当月の新規案件',
      value: currentMonthDealCount.toLocaleString(),
      unit: '件',
      deltaPct: momPct(currentMonthDealCount, prevMonthDealCount),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    },
    {
      label: '契約率（契約+完了/全案件）',
      value: `${(contractRate * 100).toFixed(1)}%`,
      sub: `全${totalDeals}案件`,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'リピート率',
      value: `${(repeatRate * 100).toFixed(1)}%`,
      sub: `${repeatCustomers}/${customersWithPurchase}名が複数回`,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>,
    },
    {
      label: '本日の案件',
      value: todayCases.length.toLocaleString(),
      unit: '件',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
    },
  ]

  return (
    <StorePage title="ダッシュボード" subtitle={storeName} width="data" className="space-y-6">
      {/* ── ランク + KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="relative rounded-2xl p-4 overflow-hidden flex items-center justify-center bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-1)]">
          <div className="text-center">
            <p className="text-[10px] mb-2 text-[var(--md-sys-color-on-surface-variant)]">全店舗ランキング（当月）</p>
            <RankBadge rank={myRank} />
            <p className="text-[10px] mt-1 text-[var(--md-sys-color-on-surface-faint)]">/ {totalStores}店舗中</p>
          </div>
        </div>
        {kpiCards.map(card => <KpiCard key={card.label} {...card} />)}
      </div>

      {/* ── 買取金額推移 ── */}
      <ChartCard>
        <SectionHeading>買取金額の推移（月次・直近12ヶ月）</SectionHeading>
        {monthlyPurchaseAmount.every(d => d.amount === 0) ? (
          <p className="text-sm text-center py-12 text-[var(--md-sys-color-on-surface-faint)]">買取実績がありません</p>
        ) : (
          <div className="h-52 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyPurchaseAmount} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="storePurchaseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} tickFormatter={yenAxis} width={46} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />} />
                <Area type="monotone" dataKey="amount" stroke={ACCENT} strokeWidth={2} fill="url(#storePurchaseGrad)" dot={false} activeDot={{ r: 4, fill: ACCENT, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* ── 訪問件数推移 + ランキング ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard>
          <SectionHeading>訪問件数の推移（月次）</SectionHeading>
          {monthlyVisits.every(d => d.count === 0) ? (
            <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-faint)]">訪問データがありません</p>
          ) : (
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyVisits} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="storeVisitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                  <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2} fill="url(#storeVisitGrad)" dot={false} activeDot={{ r: 4, fill: ACCENT, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard>
          <SectionHeading>店舗ランキング TOP10（当月）</SectionHeading>
          {top10.length === 0 ? (
            <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-faint)]">当月のデータがありません</p>
          ) : (
            <div className="space-y-2.5">
              {top10.map((store) => (
                <div key={store.rank} className={`flex items-center gap-2 ${store.isMe ? '-mx-2 px-2 py-1 rounded-xl bg-[var(--store-primary-container)]' : ''}`}>
                  <span className="text-xs w-5 text-center flex-shrink-0 font-semibold text-[var(--md-sys-color-on-surface-faint)]">
                    {store.rank}
                  </span>
                  <span className={`text-xs w-28 truncate flex-shrink-0 ${store.isMe ? 'font-semibold text-[var(--store-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                    {store.name}
                    {store.isMe && <span className="ml-1 text-[10px] text-[var(--md-sys-color-on-surface-faint)]">（自店舗）</span>}
                  </span>
                  <div className="flex-1 rounded-full h-1.5 bg-[var(--md-sys-color-outline-variant)]">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.max(store.ratio * 100, 4)}%`,
                        background: store.isMe ? ACCENT : '#a3a3a3',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── 案件数推移 ＋ ステータス割合 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard>
          <SectionHeading>案件数の推移（月次・直近12ヶ月）</SectionHeading>
          {monthlyDeals.every(d => d.count === 0) ? (
            <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-faint)]">案件データがありません</p>
          ) : (
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyDeals} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="storeDealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                  <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2} fill="url(#storeDealGrad)" dot={false} activeDot={{ r: 4, fill: ACCENT, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard>
          <SectionHeading>案件ステータスの割合</SectionHeading>
          {statusPie.length === 0 ? (
            <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-faint)]">案件データがありません</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-44 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2}>
                      {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [`${value}件`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 min-w-0">
                {statusPie.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: e.color }} />
                    <span className="text-[var(--md-sys-color-on-surface-variant)] truncate flex-1">{e.name}</span>
                    <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{e.value}件</span>
                    <span className="text-[var(--md-sys-color-on-surface-faint)] w-10 text-right">{totalDeals > 0 ? Math.round((e.value / totalDeals) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── 流入経路の割合 ── */}
      <ChartCard>
        <SectionHeading>流入経路の割合（担当顧客）</SectionHeading>
        {leadPie.length === 0 ? (
          <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-faint)]">顧客データがありません</p>
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leadPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2}>
                    {leadPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [`${value}名`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2 min-w-[180px]">
              {(() => {
                const leadTotal = leadPie.reduce((s, e) => s + e.value, 0)
                return leadPie.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: e.color }} />
                    <span className="text-[var(--md-sys-color-on-surface-variant)] truncate flex-1">{e.name}</span>
                    <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{e.value}名</span>
                    <span className="text-[var(--md-sys-color-on-surface-faint)] text-xs w-10 text-right">{leadTotal > 0 ? Math.round((e.value / leadTotal) * 100) : 0}%</span>
                  </li>
                ))
              })()}
            </ul>
          </div>
        )}
      </ChartCard>

      {/* ── 本日の案件一覧 ── */}
      <ChartCard>
        <SectionHeading>本日の案件一覧</SectionHeading>
        {todayCases.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[var(--md-sys-color-on-surface-faint)]">本日の予定はありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayCases.map((c, i) => (
              <button
                key={c.id}
                onClick={() => router.push(`/store/schedule/${c.id}`)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer shadow-[var(--md-sys-elevation-1)] hover:bg-[var(--md-sys-color-surface-container)] animate-fade-in-up"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--md-sys-color-surface-container-high)]">
                  <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{c.customerName[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{c.customerName} 様</span>
                    <StatusBadge status={c.status as any} />
                  </div>
                  <p className="text-xs truncate mt-0.5 text-[var(--md-sys-color-on-surface-variant)]">{c.address}</p>
                  {c.note && <p className="text-xs truncate mt-0.5 text-[var(--md-sys-color-on-surface-faint)]">{c.note}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {c.purchaseAmount != null && c.purchaseAmount > 0 ? (
                    <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">¥{c.purchaseAmount.toLocaleString()}</span>
                  ) : (
                    <span className="text-xs text-[var(--md-sys-color-on-surface-faint)]">未査定</span>
                  )}
                </div>
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--md-sys-color-on-surface-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </ChartCard>
    </StorePage>
  )
}
