'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import AppBar from '@/components/AppBar'
import SummaryCard from '@/components/SummaryCard'
import Card from '@/components/Card'
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

// 金額のY軸フォーマッター
function yenAxisFormatter(value: number) {
  if (value >= 1_000_000) return `${(value / 10_000).toFixed(0)}万`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  return `${value.toLocaleString()}`
}

// カスタムTooltip（買取金額グラフ用）
function AmountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] shadow-[var(--md-sys-elevation-2)] px-3 py-2 text-sm">
      <p className="font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">{label}</p>
      <p className="text-[var(--status-completed-text)] font-semibold">¥{payload[0].value.toLocaleString()}</p>
    </div>
  )
}

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

  if (loading || !data) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const {
    summary, storeRanking, monthlyNewCustomers, monthlyVisits, dailyVisits,
    monthlyPurchaseAmount, storePurchaseRanking,
  } = data
  const maxStoreCount = Math.max(...storeRanking.map(s => s.count), 1)
  const maxPurchaseAmount = Math.max(...storePurchaseRanking.map(s => s.amount), 1)

  const summaryCards = [
    { label: '総顧客数',     value: summary.totalCustomers.toLocaleString(),              unit: '名', color: 'bg-blue-600' },
    { label: '当月新規顧客', value: summary.currentMonthCustomers.toLocaleString(),       unit: '名', color: 'bg-red-600' },
    { label: '総訪問数',     value: summary.totalVisitsCount.toLocaleString(),            unit: '件', color: 'bg-emerald-600' },
    { label: '当月訪問数',   value: summary.currentMonthVisits.toLocaleString(),         unit: '件', color: 'bg-amber-500' },
    { label: '総買取金額',   value: fmtYen(summary.totalPurchaseAmount),                 unit: '',   color: 'bg-purple-600' },
    { label: '当月買取金額', value: fmtYen(summary.currentMonthPurchaseAmount),          unit: '',   color: 'bg-pink-500' },
  ]

  return (
    <>
      <AppBar title="ダッシュボード" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* テストデータトグル */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowTestData(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showTestData ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-[var(--toggle-thumb,#fff)] rounded-full shadow transition-transform ${
                showTestData ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              テストデータを含む
            </span>
          </label>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {summaryCards.map(card => (
            <SummaryCard
              key={card.label}
              label={card.label}
              value={card.value}
              unit={card.unit}
              accentColor={card.color}
            />
          ))}
        </div>

        {/* 買取金額推移グラフ */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
            買取金額の推移（月次・直近12ヶ月）
          </h2>
          {monthlyPurchaseAmount.every(d => d.amount === 0) ? (
            <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-12">買取実績がありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyPurchaseAmount} margin={{ top: 4, right: 8, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={yenAxisFormatter} width={58} />
                <Tooltip content={<AmountTooltip />} />
                <Bar dataKey="amount" fill="#A78BFA" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* 店舗別買取金額ランキング ＋ 店舗別顧客数ランキング */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 店舗別買取金額ランキング */}
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
              店舗別買取金額ランキング（全期間 TOP10）
            </h2>
            {storePurchaseRanking.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">買取実績がありません</p>
            ) : (
              <div className="space-y-3">
                {storePurchaseRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i < 3 ? 'text-violet-400' : 'text-[var(--md-sys-color-outline)]'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)] w-28 truncate flex-shrink-0">{store.name}</span>
                    <div className="flex-1 bg-[var(--md-sys-color-surface-container-high)] rounded-full h-2">
                      <div
                        className="bg-violet-400 h-2 rounded-full transition-all"
                        style={{ width: `${(store.amount / maxPurchaseAmount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] w-20 text-right flex-shrink-0">
                      {fmtYen(store.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 店舗別当月顧客数ランキング */}
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
              店舗別顧客数ランキング（当月 TOP10）
            </h2>
            {storeRanking.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-outline)] text-center py-8">当月のデータがありません</p>
            ) : (
              <div className="space-y-3">
                {storeRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i < 3 ? 'text-red-400' : 'text-[var(--md-sys-color-outline)]'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)] w-28 truncate flex-shrink-0">{store.name}</span>
                    <div className="flex-1 bg-[var(--md-sys-color-surface-container-high)] rounded-full h-2">
                      <div
                        className="bg-red-400 h-2 rounded-full transition-all"
                        style={{ width: `${(store.count / maxStoreCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] w-8 text-right flex-shrink-0">{store.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 月次新規顧客数 ＋ 月次訪問数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 月次新規顧客数 */}
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
              新規顧客獲得数の推移（月次）
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyNewCustomers} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [`${v}名`, '新規顧客']} />
                <Bar dataKey="count" fill="#F87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* 月次訪問数推移 */}
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
              訪問件数の推移（月次）
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyVisits} margin={{ top: 0, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [`${v}件`, '訪問数']} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#F87171"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#F87171' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* 日次訪問数 */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">
            訪問件数の推移（直近30日）
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyVisits} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval={4}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v: any) => [`${v}件`, '訪問数']} />
              <Bar dataKey="count" fill="#60A5FA" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

      </div>
    </>
  )
}
