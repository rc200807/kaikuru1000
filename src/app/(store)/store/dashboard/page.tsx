'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import StorePage from '@/components/store/StorePage'
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
}

function KpiCard({ label, value, unit, sub, icon }: KpiProps) {
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
      {sub && <p className="text-[11px] mt-1 text-[var(--md-sys-color-on-surface-faint)]">{sub}</p>}
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
  const [shippedCount, setShippedCount] = useState(0)

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
    fetch('/api/store/delivery-shipments?status=shipped')
      .then(r => r.json())
      .then(d => { if (d.shippedCount) setShippedCount(d.shippedCount) })
      .catch(() => {})
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
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: '当月訪問件数',
      value: currentMonthVisitCount.toLocaleString(),
      unit: '件',
      sub: `完了 ${currentMonthCompletedCount}件`,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
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
      {/* 発送通知バナー */}
      {shippedCount > 0 && (
        <button
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => router.push('/store/deliveries?status=shipped')}
        >
          <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">{shippedCount}件の荷物が発送されました</p>
            <p className="text-xs text-amber-600">受取確認をしてください</p>
          </div>
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

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
