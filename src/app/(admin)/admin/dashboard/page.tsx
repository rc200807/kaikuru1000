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
  icon: React.ReactNode
}

function KpiCard({ label, value, unit, sub, icon }: KpiProps) {
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: '#171717', border: '1px solid #262626' }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-normal" style={{ color: '#a3a3a3' }}>{label}</span>
        <span style={{ color: '#525252' }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl tracking-tight" style={{ color: '#ffffff', fontWeight: 600 }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: '#a3a3a3' }}>{unit}</span>}
      </div>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: '#737373' }}>{sub}</p>}
    </div>
  )
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#262626', border: '1px solid #333333' }}>
      <p className="mb-1" style={{ color: '#a3a3a3' }}>{label}</p>
      <p className="font-semibold text-sm" style={{ color: '#ffffff' }}>
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-sm" style={{ color: '#ffffff', fontWeight: 600 }}>{children}</h2>
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 min-w-0 ${className}`} style={{ background: '#171717', border: '1px solid #262626' }}>
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
  const [shippedCount, setShippedCount] = useState(0)
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as any
    if (user.role !== 'admin') { router.push('/'); return }
    setLoading(true)
    fetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
    fetch('/api/admin/delivery-shipments?status=shipped')
      .then(r => r.json())
      .then(d => { if (d.shippedCount) setShippedCount(d.shippedCount) })
      .catch(() => {})
  }, [status, session, router])

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
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
      ),
    },
    {
      label: '当月買取金額',
      value: fmtYen(summary.currentMonthPurchaseAmount),
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

        {/* 発送通知バナー */}
        {shippedCount > 0 && (
          <div
            className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-amber-900/40 transition-colors"
            onClick={() => router.push('/admin/deliveries?status=shipped')}
          >
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-200">{shippedCount}件の荷物が発送されました</p>
              <p className="text-xs text-amber-400">受取確認をしてください</p>
            </div>
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(card => <KpiCard key={card.label} {...card} />)}
        </div>

        {/* 買取金額推移 — Gradient Area Chart */}
        <ChartCard>
          <SectionHeading>買取金額の推移（月次・直近12ヶ月）</SectionHeading>
          {monthlyPurchaseAmount.every(d => d.amount === 0) ? (
            <p className="text-sm text-center py-12" style={{ color: '#525252' }}>買取実績がありません</p>
          ) : (
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyPurchaseAmount} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} tickFormatter={yenAxis} width={46} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />} />
                  <Area type="monotone" dataKey="amount" stroke="#ffffff" strokeWidth={2} fill="url(#purchaseGrad)" dot={false} activeDot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* 新規顧客 + 月次訪問数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard>
            <SectionHeading>新規顧客獲得数（月次）</SectionHeading>
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyNewCustomers} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}名`} />} />
                  <Area type="monotone" dataKey="count" stroke="#ffffff" strokeWidth={2} fill="url(#custGrad)" dot={false} activeDot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard>
            <SectionHeading>訪問件数の推移（月次）</SectionHeading>
            <div className="h-44 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyVisits} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                  <Area type="monotone" dataKey="count" stroke="#ffffff" strokeWidth={2} fill="url(#visitGrad)" dot={false} activeDot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* 直近30日訪問数 */}
        <ChartCard>
          <SectionHeading>訪問件数（直近30日）</SectionHeading>
          <div className="h-44 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyVisits} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                <Bar dataKey="count" fill="#ffffff" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ランキング */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* 店舗別買取金額 */}
          <ChartCard>
            <SectionHeading>店舗別買取金額（全期間 TOP10）</SectionHeading>
            {storePurchaseRanking.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#525252' }}>買取実績がありません</p>
            ) : (
              <div className="space-y-3">
                {storePurchaseRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-2">
                    <span className="text-xs w-5 text-center flex-shrink-0" style={{ color: '#737373', fontWeight: 600 }}>
                      {i + 1}
                    </span>
                    <span className="text-xs w-24 truncate flex-shrink-0" style={{ color: '#e5e5e5' }}>{store.name}</span>
                    <div className="flex-1 rounded-full h-1.5" style={{ background: '#262626' }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(store.amount / maxPurchaseAmount) * 100}%`, background: '#ffffff' }}
                      />
                    </div>
                    <span className="text-xs w-16 text-right flex-shrink-0" style={{ color: '#e5e5e5', fontWeight: 600 }}>
                      {fmtYen(store.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          {/* 店舗別顧客数 */}
          <ChartCard>
            <SectionHeading>店舗別顧客数（当月 TOP10）</SectionHeading>
            {storeRanking.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#525252' }}>当月のデータがありません</p>
            ) : (
              <div className="space-y-3">
                {storeRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-2">
                    <span className="text-xs w-5 text-center flex-shrink-0" style={{ color: '#737373', fontWeight: 600 }}>
                      {i + 1}
                    </span>
                    <span className="text-xs w-24 truncate flex-shrink-0" style={{ color: '#e5e5e5' }}>{store.name}</span>
                    <div className="flex-1 rounded-full h-1.5" style={{ background: '#262626' }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(store.count / maxStoreCount) * 100}%`, background: '#ffffff' }}
                      />
                    </div>
                    <span className="text-xs w-8 text-right flex-shrink-0" style={{ color: '#e5e5e5', fontWeight: 600 }}>
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
