'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import AppBar from '@/components/AppBar'

// ── Metal config ──────────────────────────────────────────────────────────────

type MetalKey = 'gold' | 'silver' | 'platinum' | 'palladium'

const METALS: {
  key: MetalKey
  label: string
  labelEn: string
  color: string
  gradientFrom: string
  gradientTo: string
  symbol: string
}[] = [
  {
    key: 'gold',
    label: '金',
    labelEn: 'Gold',
    color: '#F59E0B',
    gradientFrom: 'rgba(245,158,11,0.35)',
    gradientTo: 'rgba(245,158,11,0)',
    symbol: 'GC=F',
  },
  {
    key: 'silver',
    label: '銀',
    labelEn: 'Silver',
    color: '#94A3B8',
    gradientFrom: 'rgba(148,163,184,0.35)',
    gradientTo: 'rgba(148,163,184,0)',
    symbol: 'SI=F',
  },
  {
    key: 'platinum',
    label: 'プラチナ',
    labelEn: 'Platinum',
    color: '#38BDF8',
    gradientFrom: 'rgba(56,189,248,0.35)',
    gradientTo: 'rgba(56,189,248,0)',
    symbol: 'PL=F',
  },
  {
    key: 'palladium',
    label: 'パラジウム',
    labelEn: 'Palladium',
    color: '#A78BFA',
    gradientFrom: 'rgba(167,139,250,0.35)',
    gradientTo: 'rgba(167,139,250,0)',
    symbol: 'PA=F',
  },
]

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', '5Y'] as const
type Period = (typeof PERIODS)[number]

// ── Types ─────────────────────────────────────────────────────────────────────

type PricePoint = {
  date: string
  priceJpy: number
  priceUsd: number
}

type MarketData = {
  metal: string
  period: string
  currentPriceJpy: number
  currentPriceUsd: number
  usdJpy: number
  change: number
  changePct: number
  history: PricePoint[]
  updatedAt: string
}

type PhonePrice = {
  id: string
  model: string
  series: string
  storage: string
  gradeA: number | null
  gradeB: number | null
  gradeC: number | null
  fetchedAt: string
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="text-[var(--md-sys-color-on-surface-variant)] mb-1">{label}</p>
      <p className="font-bold text-sm" style={{ color: d.color }}>
        ¥{d.value?.toLocaleString()}<span className="text-[10px] font-normal ml-1">/g</span>
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr)
  if (period === '1W') return `${d.getMonth() + 1}/${d.getDate()}`
  if (period === '1M' || period === '3M') return `${d.getMonth() + 1}/${d.getDate()}`
  if (period === '6M' || period === '1Y') return `${d.getMonth() + 1}月`
  return `${d.getFullYear()}`
}

function tickEvery(data: PricePoint[], period: Period): string[] {
  if (!data.length) return []
  const target = period === '1W' ? 5 : period === '1M' ? 8 : period === '3M' ? 6 : period === '6M' ? 6 : period === '1Y' ? 12 : 5
  const step = Math.max(1, Math.floor(data.length / target))
  return data.filter((_, i) => i % step === 0).map(d => d.date)
}

type PageTab = 'metals' | 'iphone'

type Props = { portal: 'store' | 'admin' }

export default function MarketPricesPage({ portal }: Props) {
  const [pageTab, setPageTab] = useState<PageTab>('metals')

  // ── Metals state ──
  const [activeMetal, setActiveMetal] = useState<MetalKey>('gold')
  const [activePeriod, setActivePeriod] = useState<Period>('1M')
  const [data, setData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── iPhone state ──
  const [iphonePrices, setIphonePrices] = useState<PhonePrice[]>([])
  const [iphoneLoading, setIphoneLoading] = useState(false)
  const [iphoneError, setIphoneError] = useState<string | null>(null)
  const [iphoneLastUpdated, setIphoneLastUpdated] = useState<string | null>(null)
  const [iphoneSearch, setIphoneSearch] = useState('')
  const [iphoneSelectedSeries, setIphoneSelectedSeries] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)

  const metalConfig = METALS.find(m => m.key === activeMetal)!

  const fetchData = useCallback(async (metal: MetalKey, period: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-prices?metal=${metal}&period=${period}`)
      if (!res.ok) throw new Error((await res.json()).error || 'エラーが発生しました')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(activeMetal, activePeriod)
  }, [activeMetal, activePeriod, fetchData])

  const fetchIPhonePrices = useCallback(async () => {
    setIphoneLoading(true)
    setIphoneError(null)
    try {
      const res = await fetch('/api/market/phones')
      if (!res.ok) throw new Error('データの取得に失敗しました')
      const d = await res.json()
      setIphonePrices(d.prices)
      setIphoneLastUpdated(d.lastUpdated)
    } catch (e: any) {
      setIphoneError(e.message)
    } finally {
      setIphoneLoading(false)
    }
  }, [])

  useEffect(() => {
    if (pageTab === 'iphone') fetchIPhonePrices()
  }, [pageTab, fetchIPhonePrices])

  const handleRefreshIPhone = async () => {
    if (!confirm('全iPhoneモデルの価格をGemini AIで更新します。数分かかる場合があります。よろしいですか？')) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/market/phones/refresh', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      alert(`更新完了: ${d.saved}件のデータを保存しました`)
      await fetchIPhonePrices()
    } catch (e: any) {
      alert(`エラー: ${e.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const ticks = data ? tickEvery(data.history, activePeriod) : []
  const isPositive = (data?.change ?? 0) >= 0

  // min/max for Y axis padding
  const prices = data?.history.map(d => d.priceJpy) ?? []
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const yPad = (maxPrice - minPrice) * 0.1 || 100

  return (
    <>
      <AppBar title="相場情報" subtitle={pageTab === 'metals' ? '貴金属スポット価格' : 'iPhone中古買取参考相場'} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Page tab */}
        <div className="flex gap-2 p-1 bg-[var(--md-sys-color-surface-container)] rounded-2xl">
          {([
            { key: 'metals', label: '貴金属相場' },
            { key: 'iphone', label: 'iPhone中古相場' },
          ] as { key: PageTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setPageTab(tab.key)}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all ${
                pageTab === tab.key
                  ? 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                  : 'text-[var(--md-sys-color-on-surface-variant)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Metals tab ── */}
        {pageTab === 'metals' && (
          <>
            {/* Metal selector tabs */}
            <div className="grid grid-cols-4 gap-2">
              {METALS.map(m => {
                const isActive = activeMetal === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setActiveMetal(m.key)}
                    className={`
                      relative flex flex-col items-center justify-center gap-1
                      py-3 px-2 rounded-2xl border transition-all duration-200
                      ${isActive
                        ? 'border-transparent shadow-md'
                        : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] hover:bg-[var(--md-sys-color-surface-container)]'
                      }
                    `}
                    style={isActive ? { background: `linear-gradient(135deg, ${m.gradientFrom.replace('0.35', '0.9')}, ${m.gradientFrom.replace('0.35', '0.4')})`, borderColor: m.color } : {}}
                  >
                    {/* Color dot */}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: m.color, boxShadow: isActive ? `0 0 8px ${m.color}` : 'none' }}
                    />
                    <span className={`text-sm font-bold hidden sm:block ${isActive ? 'text-white' : 'text-[var(--md-sys-color-on-surface)]'}`}>
                      {m.label}
                    </span>
                    <span className={`text-[10px] hidden sm:block ${isActive ? 'text-white/80' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                      {m.labelEn}
                    </span>
                    <span className={`text-xs font-bold sm:hidden ${isActive ? 'text-white' : 'text-[var(--md-sys-color-on-surface)]'}`}>
                      {m.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Price card */}
            <div
              className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${metalConfig.gradientFrom.replace('0.35', '0.15')} 0%, transparent 60%)`,
                border: `1px solid ${metalConfig.color}33`,
              }}
            >
              {/* Decorative glow */}
              <div
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 blur-3xl pointer-events-none"
                style={{ background: metalConfig.color }}
              />

              {loading ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: metalConfig.color, borderTopColor: 'transparent' }} />
                  <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">データを取得中...</span>
                </div>
              ) : error ? (
                <div className="py-4">
                  <p className="text-sm text-[var(--md-sys-color-error)]">{error}</p>
                  <button
                    onClick={() => fetchData(activeMetal, activePeriod)}
                    className="mt-2 text-xs underline text-[var(--md-sys-color-on-surface-variant)]"
                  >
                    再試行
                  </button>
                </div>
              ) : data && (
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                        {metalConfig.label} ({metalConfig.labelEn})
                      </span>
                      <span className="text-[10px] text-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container)] px-2 py-0.5 rounded-full">
                        JPY/g
                      </span>
                    </div>

                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-black tracking-tight" style={{ color: metalConfig.color }}>
                        ¥{data.currentPriceJpy.toLocaleString()}
                      </span>
                      <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">/g</span>
                    </div>

                    {/* Change */}
                    <div className={`flex items-center gap-1.5 mt-1 text-sm font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                          d={isPositive
                            ? 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941'
                            : 'M2.25 6L9 12.75l4.306-4.307a11.95 11.95 0 015.814 5.519l2.74 1.22m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941'
                          }
                        />
                      </svg>
                      <span>{isPositive ? '+' : ''}{data.change.toLocaleString()}円</span>
                      <span className="text-xs font-normal opacity-80">
                        ({isPositive ? '+' : ''}{data.changePct}%)
                      </span>
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      USD/JPY <span className="font-medium text-[var(--md-sys-color-on-surface)]">¥{data.usdJpy}</span>
                    </p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      USD/oz <span className="font-medium text-[var(--md-sys-color-on-surface)]">${data.currentPriceUsd.toLocaleString()}</span>
                    </p>
                    <p className="text-[10px] text-[var(--md-sys-color-outline)] mt-1">
                      更新: {new Date(data.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Period selector + Chart */}
            <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-3xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
              {/* Period buttons */}
              <div className="flex items-center gap-1 px-4 pt-4 pb-2">
                {PERIODS.map(p => (
                  <button
                    key={p}
                    onClick={() => setActivePeriod(p)}
                    className={`
                      px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                      ${activePeriod === p
                        ? 'text-white shadow-sm'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]'
                      }
                    `}
                    style={activePeriod === p ? { background: metalConfig.color } : {}}
                  >
                    {p}
                  </button>
                ))}
                <div className="flex-1" />
                {loading && (
                  <div
                    className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: metalConfig.color, borderTopColor: 'transparent' }}
                  />
                )}
              </div>

              {/* Chart */}
              <div className="h-64 sm:h-80 px-2 pb-4 min-w-0">
                {!loading && !error && data?.history.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.history.map(d => ({
                        ...d,
                        label: formatDate(d.date, activePeriod),
                      }))}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id={`grad-${activeMetal}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={metalConfig.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={metalConfig.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--md-sys-color-outline-variant, #E0E0E0)"
                        opacity={0.5}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        ticks={ticks.map(d => formatDate(d, activePeriod))}
                        tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant, #757575)' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[Math.floor(minPrice - yPad), Math.ceil(maxPrice + yPad)]}
                        tick={{ fontSize: 10, fill: 'var(--md-sys-color-on-surface-variant, #757575)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `¥${(v / 1000).toFixed(1)}k`}
                        width={52}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="priceJpy"
                        stroke={metalConfig.color}
                        strokeWidth={2.5}
                        fill={`url(#grad-${activeMetal})`}
                        dot={false}
                        activeDot={{ r: 5, fill: metalConfig.color, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : !loading && error ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">グラフを表示できません</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div
                      className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: metalConfig.color, borderTopColor: 'transparent' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* All metals summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {METALS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setActiveMetal(m.key)}
                  className={`
                    rounded-2xl p-3 text-left border transition-all
                    ${activeMetal === m.key
                      ? 'border-transparent shadow-sm'
                      : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] hover:bg-[var(--md-sys-color-surface-container)]'
                    }
                  `}
                  style={activeMetal === m.key ? {
                    background: `linear-gradient(135deg, ${m.gradientFrom.replace('0.35', '0.1')}, transparent)`,
                    borderColor: m.color + '44',
                  } : {}}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{m.label}</span>
                  </div>
                  <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                    {activeMetal === m.key && data
                      ? `¥${data.currentPriceJpy.toLocaleString()}`
                      : '—'
                    }
                  </p>
                  {activeMetal === m.key && data && (
                    <p className={`text-[10px] font-medium mt-0.5 ${data.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {data.change >= 0 ? '+' : ''}{data.changePct}%
                    </p>
                  )}
                </button>
              ))}
            </div>

            {/* Data source note */}
            <p className="text-center text-[10px] text-[var(--md-sys-color-outline)]">
              データソース: Yahoo Finance — 相場は参考値です。最新情報は各金融機関でご確認ください。
            </p>
          </>
        )}

        {/* ── iPhone tab ── */}
        {pageTab === 'iphone' && (
          <div className="space-y-4">
            {/* ヘッダー: 最終更新日 + 更新ボタン（管理者のみ） */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  参考買取相場価格（Gemini AI推定値）
                </p>
                {iphoneLastUpdated && (
                  <p className="text-[10px] text-[var(--md-sys-color-outline)] mt-0.5">
                    最終更新: {new Date(iphoneLastUpdated).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                )}
              </div>
              {portal === 'admin' && (
                <button
                  onClick={handleRefreshIPhone}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--portal-primary)] text-white disabled:opacity-50 transition-opacity"
                >
                  {refreshing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      更新中...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      価格を更新（月次）
                    </>
                  )}
                </button>
              )}
            </div>

            {/* 検索 + シリーズフィルター */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px] relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="モデル名で検索..."
                  value={iphoneSearch}
                  onChange={e => setIphoneSearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-xl text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary)]"
                />
              </div>
              <select
                value={iphoneSelectedSeries}
                onChange={e => setIphoneSelectedSeries(e.target.value)}
                className="h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-xl text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary)]"
              >
                <option value="all">すべてのシリーズ</option>
                {Array.from(new Set(iphonePrices.map(p => p.series))).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* ローディング / エラー / テーブル */}
            {iphoneLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : iphoneError ? (
              <div className="text-center py-10">
                <p className="text-sm text-[var(--md-sys-color-error)] mb-2">{iphoneError}</p>
                <button onClick={fetchIPhonePrices} className="text-xs underline text-[var(--md-sys-color-on-surface-variant)]">再試行</button>
              </div>
            ) : iphonePrices.length === 0 ? (
              <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] border-dashed p-12 text-center">
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-1">価格データがありません</p>
                {portal === 'admin' && (
                  <p className="text-xs text-[var(--md-sys-color-outline)]">「価格を更新」ボタンで初回データを取得してください</p>
                )}
              </div>
            ) : (() => {
              const filtered = iphonePrices.filter(p => {
                const matchSearch = !iphoneSearch || p.model.toLowerCase().includes(iphoneSearch.toLowerCase())
                const matchSeries = iphoneSelectedSeries === 'all' || p.series === iphoneSelectedSeries
                return matchSearch && matchSeries
              })

              // シリーズごとにグループ化
              const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, p) => {
                if (!acc[p.series]) acc[p.series] = []
                acc[p.series].push(p)
                return acc
              }, {})

              return (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([series, items]) => (
                    <div key={series} className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                      {/* Series header */}
                      <div className="px-4 py-2.5 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)]">
                        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">{series}</span>
                      </div>

                      {/* Table */}
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                            <th className="text-left px-4 py-2 font-medium text-[var(--md-sys-color-on-surface-variant)]">モデル</th>
                            <th className="text-right px-3 py-2 font-medium text-[var(--md-sys-color-on-surface-variant)]">容量</th>
                            <th className="text-right px-3 py-2 font-medium text-emerald-600">A評価</th>
                            <th className="text-right px-3 py-2 font-medium text-amber-600">B評価</th>
                            <th className="text-right px-3 py-2 font-medium text-[var(--md-sys-color-on-surface-variant)]">C評価</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr
                              key={item.id}
                              className={`border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0 ${idx % 2 === 0 ? '' : 'bg-[var(--md-sys-color-surface-container)]/30'}`}
                            >
                              <td className="px-4 py-2.5 font-medium text-[var(--md-sys-color-on-surface)]">{item.model}</td>
                              <td className="px-3 py-2.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{item.storage}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                                {item.gradeA != null ? `¥${item.gradeA.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-amber-600">
                                {item.gradeB != null ? `¥${item.gradeB.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right text-[var(--md-sys-color-on-surface-variant)]">
                                {item.gradeC != null ? `¥${item.gradeC.toLocaleString()}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  <p className="text-center text-[10px] text-[var(--md-sys-color-outline)]">
                    ※ Gemini AIによる推定値です。実際の買取価格は状態・需要により異なります。月に一度更新されます。
                  </p>
                </div>
              )
            })()}
          </div>
        )}

      </div>
    </>
  )
}
