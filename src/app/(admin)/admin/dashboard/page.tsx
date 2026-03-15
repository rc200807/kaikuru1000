'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

type DashboardData = {
  summary: {
    totalCustomers: number
    currentMonthCustomers: number
    totalVisitsCount: number
    currentMonthVisits: number
    totalPurchaseAmount: number
    currentMonthPurchaseAmount: number
  }
  storeRanking: { storeId: string; name: string; count: number }[]
  monthlyNewCustomers: { month: string; count: number }[]
  monthlyVisits: { month: string; count: number }[]
  dailyVisits: { date: string; count: number }[]
  monthlyPurchaseAmount: { month: string; amount: number }[]
  storePurchaseRanking: { storeId: string; name: string; amount: number }[]
}

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

// ── KPI card ──────────────────────────────────────────────────────────────────

type KpiProps = {
  label: string
  value: string
  unit?: string
  sub?: string
  color: string
  gradFrom: string
  gradTo: string
  icon: React.ReactNode
}

function KpiCard({ label, value, unit, sub, color, gradFrom, gradTo, icon }: KpiProps) {
  return (
    <div
      className="relative rounded-3xl p-4 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradFrom} 0%, ${gradTo} 100%)`,
        border: `1px solid ${color}33`,
      }}
    >
      {/* glow */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium opacity-70 text-white">{label}</span>
        <span className="opacity-50 text-white">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-white tracking-tight">{value}</span>
        {unit && <span className="text-xs text-white/70">{unit}</span>}
      </div>
      {sub && <p className="text-[11px] text-white/60 mt-1">{sub}</p>}
    </div>
  )
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="text-[var(--md-sys-color-on-surface-variant)] mb-1">{label}</p>
      <p className="font-bold text-sm" style={{ color: payload[0].color }}>
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{children}</h2>
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--md-sys-color-surface-container-lowest,#1a1a2e)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] p-5 min-w-0 ${className}`}>
      {children}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTestData, setShowTestData] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as any
    if (user.role !== 'admin') { router.push('/'); return }
    setLoading(true)
    const url = showTestData ? '/api/admin/dashboard?includeTestData=true' : '/api/admin/dashboard'
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [status, session, router, showTestData])

  if (loading || !data) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const { summary, storeRanking, monthlyNewCustomers, monthlyVisits, dailyVisits, monthlyPurchaseAmount, storePurchaseRanking } = data
  const maxStoreCount = Math.max(...storeRanking.map(s => s.count), 1)
  const maxPurchaseAmount = Math.max(...storePurchaseRanking.map(s => s.amount), 1)

  const kpiCards: KpiProps[] = [
    {
      label: '総顧客数',
      value: summary.totalCustomers.toLocaleString(),
      unit: '名',
      sub: `当月新規 +${summary.currentMonthCustomers}名`,
      color: '#3B82F6',
      gradFrom: 'rgba(59,130,246,0.7)',
      gradTo: 'rgba(37,99,235,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      label: '当月新規顧客',
      value: summary.currentMonthCustomers.toLocaleString(),
      unit: '名',
      color: '#EC4899',
      gradFrom: 'rgba(236,72,153,0.7)',
      gradTo: 'rgba(190,24,93,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109z" />
        </svg>
      ),
    },
    {
      label: '総訪問数',
      value: summary.totalVisitsCount.toLocaleString(),
      unit: '件',
      sub: `当月 ${summary.currentMonthVisits}件`,
      color: '#10B981',
      gradFrom: 'rgba(16,185,129,0.7)',
      gradTo: 'rgba(5,150,105,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    },
    {
      label: '当月訪問数',
      value: summary.currentMonthVisits.toLocaleString(),
      unit: '件',
      color: '#F59E0B',
      gradFrom: 'rgba(245,158,11,0.7)',
      gradTo: 'rgba(217,119,6,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      ),
    },
    {
      label: '総買取金額',
      value: fmtYen(summary.totalPurchaseAmount),
      color: '#A78BFA',
      gradFrom: 'rgba(167,139,250,0.7)',
      gradTo: 'rgba(124,58,237,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
      ),
    },
    {
      label: '当月買取金額',
      value: fmtYen(summary.currentMonthPurchaseAmount),
      color: '#F472B6',
      gradFrom: 'rgba(244,114,182,0.7)',
      gradTo: 'rgba(219,39,119,0.4)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <>
      <AppBar title="ダッシュボード" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* テストデータトグル */}
        <div className="flex justify-end">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowTestData(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${showTestData ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-[var(--toggle-thumb,#fff)] rounded-full shadow transition-transform ${showTestData ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">テストデータを含む</span>
          </label>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(card => <KpiCard key={card.label} {...card} />)}
        </div>

        {/* 買取金額推移 — Gradient Area Chart */}
        <ChartCard>
          <SectionHeading color="#A78BFA">買取金額の推移（月次・直近12ヶ月）</SectionHeading>
          {monthlyPurchaseAmount.every(d => d.amount === 0) ? (
            <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-12">買取実績がありません</p>
          ) : (
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyPurchaseAmount} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#333)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} tickFormatter={yenAxis} width={46} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />} />
                  <Area type="monotone" dataKey="amount" stroke="#A78BFA" strokeWidth={2.5} fill="url(#purchaseGrad)" dot={false} activeDot={{ r: 5, fill: '#A78BFA', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* 新規顧客 + 月次訪問数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard>
            <SectionHeading color="#EC4899">新規顧客獲得数（月次）</SectionHeading>
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyNewCustomers} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EC4899" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#EC4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#333)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}名`} />} />
                  <Area type="monotone" dataKey="count" stroke="#EC4899" strokeWidth={2.5} fill="url(#custGrad)" dot={false} activeDot={{ r: 5, fill: '#EC4899', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard>
            <SectionHeading color="#10B981">訪問件数の推移（月次）</SectionHeading>
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyVisits} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#333)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                  <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2.5} fill="url(#visitGrad)" dot={false} activeDot={{ r: 5, fill: '#10B981', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* 直近30日訪問数 */}
        <ChartCard>
          <SectionHeading color="#60A5FA">訪問件数（直近30日）</SectionHeading>
          <div className="h-44 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyVisits} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#333)" opacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#aaa)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                <Bar dataKey="count" fill="#60A5FA" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ランキング */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* 店舗別買取金額 */}
          <ChartCard>
            <SectionHeading color="#A78BFA">店舗別買取金額（全期間 TOP10）</SectionHeading>
            {storePurchaseRanking.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">買取実績がありません</p>
            ) : (
              <div className="space-y-3">
                {storePurchaseRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-2">
                    <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-[var(--md-sys-color-outline)]'}`}>
                      {i + 1}
                    </span>
                    <span className="text-xs text-[var(--md-sys-color-on-surface)] w-24 truncate flex-shrink-0">{store.name}</span>
                    <div className="flex-1 bg-[var(--md-sys-color-surface-container-high)] rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(store.amount / maxPurchaseAmount) * 100}%`, background: 'linear-gradient(90deg, #A78BFA, #7C3AED)' }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] w-16 text-right flex-shrink-0">
                      {fmtYen(store.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          {/* 店舗別顧客数 */}
          <ChartCard>
            <SectionHeading color="#EC4899">店舗別顧客数（当月 TOP10）</SectionHeading>
            {storeRanking.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">当月のデータがありません</p>
            ) : (
              <div className="space-y-3">
                {storeRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-2">
                    <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-[var(--md-sys-color-outline)]'}`}>
                      {i + 1}
                    </span>
                    <span className="text-xs text-[var(--md-sys-color-on-surface)] w-24 truncate flex-shrink-0">{store.name}</span>
                    <div className="flex-1 bg-[var(--md-sys-color-surface-container-high)] rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(store.count / maxStoreCount) * 100}%`, background: 'linear-gradient(90deg, #EC4899, #BE185D)' }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] w-8 text-right flex-shrink-0">
                      {store.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>

      </div>
    </>
  )
}
