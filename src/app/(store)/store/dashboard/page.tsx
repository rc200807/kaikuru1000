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
import StatusBadge from '@/components/StatusBadge'

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
}

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

function SectionHeading({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{children}</h2>
    </div>
  )
}

function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] p-5 min-w-0 ${className}`}>
      {children}
    </div>
  )
}

// ── Rank medal ───────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-3xl font-black text-[var(--md-sys-color-outline)]">—</span>
        <span className="text-[10px] text-[var(--md-sys-color-outline)] mt-1">ランク外</span>
      </div>
    )
  }

  const medals: Record<number, { emoji: string; color: string }> = {
    1: { emoji: '🥇', color: '#F59E0B' },
    2: { emoji: '🥈', color: '#94A3B8' },
    3: { emoji: '🥉', color: '#D97706' },
  }
  const medal = medals[rank]

  return (
    <div className="flex flex-col items-center">
      {medal ? (
        <span className="text-4xl">{medal.emoji}</span>
      ) : (
        <span className="text-3xl font-black" style={{ color: '#A78BFA' }}>{rank}</span>
      )}
      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
        位
      </span>
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

  const storeName = (session?.user as any)?.name ?? '店舗'

  const kpiCards: KpiProps[] = [
    {
      label: '当月買取金額',
      value: fmtYen(currentMonthAmount),
      color: '#A78BFA',
      gradFrom: 'rgba(167,139,250,0.7)',
      gradTo: 'rgba(124,58,237,0.4)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: '当月訪問件数',
      value: currentMonthVisitCount.toLocaleString(),
      unit: '件',
      sub: `完了 ${currentMonthCompletedCount}件`,
      color: '#10B981',
      gradFrom: 'rgba(16,185,129,0.7)',
      gradTo: 'rgba(5,150,105,0.4)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
    },
    {
      label: '本日の案件',
      value: todayCases.length.toLocaleString(),
      unit: '件',
      color: '#F59E0B',
      gradFrom: 'rgba(245,158,11,0.7)',
      gradTo: 'rgba(217,119,6,0.4)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
    },
  ]

  return (
    <>
      <AppBar title="ダッシュボード" subtitle={storeName} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── ランク + KPI ── */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* ランクカード */}
          <div
            className="relative rounded-3xl p-4 overflow-hidden flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.7) 0%, rgba(124,58,237,0.5) 100%)',
              border: '1px solid rgba(59,130,246,0.3)',
            }}
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15 blur-2xl pointer-events-none bg-blue-400" />
            <div className="text-center">
              <p className="text-[10px] font-medium text-white/60 mb-2">全店舗ランキング（当月）</p>
              <RankBadge rank={myRank} />
              <p className="text-[10px] text-white/50 mt-1">/ {totalStores}店舗中</p>
            </div>
          </div>

          {/* KPIカード */}
          {kpiCards.map(card => <KpiCard key={card.label} {...card} />)}
        </div>

        {/* ── 買取金額推移 ── */}
        <ChartCard>
          <SectionHeading color="#A78BFA">買取金額の推移（月次・直近12ヶ月）</SectionHeading>
          {monthlyPurchaseAmount.every(d => d.amount === 0) ? (
            <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-12">買取実績がありません</p>
          ) : (
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyPurchaseAmount} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="storePurchaseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#ddd)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#888)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#888)' }} axisLine={false} tickLine={false} tickFormatter={yenAxis} width={46} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />} />
                  <Area type="monotone" dataKey="amount" stroke="#A78BFA" strokeWidth={2.5} fill="url(#storePurchaseGrad)" dot={false} activeDot={{ r: 5, fill: '#A78BFA', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* ── 訪問件数推移 + ランキング ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard>
            <SectionHeading color="#10B981">訪問件数の推移（月次）</SectionHeading>
            {monthlyVisits.every(d => d.count === 0) ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">訪問データがありません</p>
            ) : (
              <div className="h-44 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyVisits} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="storeVisitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant,#ddd)" opacity={0.4} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#888)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant,#888)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}件`} />} />
                    <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2.5} fill="url(#storeVisitGrad)" dot={false} activeDot={{ r: 5, fill: '#10B981', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* TOP10 ランキング */}
          <ChartCard>
            <SectionHeading color="#3B82F6">店舗ランキング TOP10（当月）</SectionHeading>
            {top10.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">当月のデータがありません</p>
            ) : (
              <div className="space-y-2.5">
                {top10.map((store) => (
                  <div key={store.rank} className={`flex items-center gap-2 ${store.isMe ? 'bg-[var(--store-primary-container,rgba(59,130,246,0.1))] -mx-2 px-2 py-1 rounded-xl' : ''}`}>
                    <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${
                      store.rank === 1 ? 'text-amber-400'
                        : store.rank === 2 ? 'text-slate-400'
                        : store.rank === 3 ? 'text-amber-700'
                        : 'text-[var(--md-sys-color-outline)]'
                    }`}>
                      {store.rank}
                    </span>
                    <span className={`text-xs w-28 truncate flex-shrink-0 ${
                      store.isMe
                        ? 'font-bold text-[var(--store-primary,#3B82F6)]'
                        : 'text-[var(--md-sys-color-on-surface)]'
                    }`}>
                      {store.name}
                      {store.isMe && <span className="ml-1 text-[10px] opacity-60">（自店舗）</span>}
                    </span>
                    <div className="flex-1 bg-[var(--md-sys-color-surface-container-high)] rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${Math.max(store.ratio * 100, 4)}%`,
                          background: store.isMe
                            ? 'linear-gradient(90deg, #3B82F6, #6366F1)'
                            : 'linear-gradient(90deg, #94A3B8, #64748B)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── 本日の案件一覧 ── */}
        <ChartCard>
          <SectionHeading color="#F59E0B">本日の案件一覧</SectionHeading>
          {todayCases.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm text-[var(--md-sys-color-outline)]">本日の予定はありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/store/schedule/${c.id}`)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors cursor-pointer group"
                >
                  {/* アバター */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{c.customerName[0]}</span>
                  </div>
                  {/* 情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{c.customerName} 様</span>
                      <StatusBadge status={c.status as any} />
                    </div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
                      {c.address}
                    </p>
                    {c.note && (
                      <p className="text-xs text-[var(--md-sys-color-outline)] truncate mt-0.5">{c.note}</p>
                    )}
                  </div>
                  {/* 金額 */}
                  <div className="text-right flex-shrink-0">
                    {c.purchaseAmount != null && c.purchaseAmount > 0 ? (
                      <span className="text-sm font-bold text-[var(--store-primary,#3B82F6)]">
                        ¥{c.purchaseAmount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--md-sys-color-outline)]">未査定</span>
                    )}
                  </div>
                  {/* 矢印 */}
                  <svg className="w-4 h-4 text-[var(--md-sys-color-outline)] group-hover:text-[var(--store-primary)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

      </div>
    </>
  )
}
