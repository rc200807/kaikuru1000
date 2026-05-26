'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts'

type Stats = {
  summary: {
    activeCount: number
    startedTotal: number
    endedTotal: number
    neverStartedCount: number
    thisYearStarted: number
    thisYearEnded: number
    totalKeys: number
  }
  cumulativeActive: { month: string; active: number }[]
  monthlyChanges: { month: string; started: number; ended: number; net: number }[]
  yearly: { year: number; started: number; ended: number }[]
}

export default function PartnerStatsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/partner/license-keys/stats')
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          setError(d.error || '読み込みに失敗しました')
          return null
        }
        return r.json()
      })
      .then(d => { if (d) setStats(d) })
      .finally(() => setLoading(false))
  }, [status])

  if (status !== 'authenticated') return null

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">集計</h1>
      <p className="text-sm text-[#a3a3a3] mb-6">
        ライセンスキーの稼働状況と推移
      </p>

      {loading ? (
        <p className="text-sm text-[#a3a3a3]">読み込み中…</p>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : !stats ? null : (
        <>
          {/* サマリ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="稼働中" sub="開始あり・終了なし" value={stats.summary.activeCount} tone="ok" />
            <StatCard label="累計 開始" value={stats.summary.startedTotal} />
            <StatCard label="累計 終了" value={stats.summary.endedTotal} tone="muted" />
            <StatCard label="未開始" value={stats.summary.neverStartedCount} tone="warn" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            <StatCard label={`今年の開始`} value={stats.summary.thisYearStarted} tone="ok" />
            <StatCard label={`今年の終了`} value={stats.summary.thisYearEnded} tone="muted" />
            <StatCard label="発行済キー総数" value={stats.summary.totalKeys} />
          </div>

          {/* 月別 稼働中ライセンス推移（過去24ヶ月） */}
          <ChartCard title="稼働中ライセンス推移（過去24ヶ月）" subtitle="各月末時点で「開始済み・終了していない」ライセンス数">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.cumulativeActive} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="active" name="稼働中" stroke="#10b981" strokeWidth={2} fill="url(#activeGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 月別 新規開始 / 終了 */}
          <ChartCard title="月毎の新規開始・終了" subtitle="過去24ヶ月">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.monthlyChanges} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} />
                <Bar dataKey="started" name="開始" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ended"   name="終了" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 月別 純増（開始 - 終了） */}
          <ChartCard title="月毎の純増（開始 − 終了）" subtitle="プラスなら稼働中ライセンスが増加、マイナスなら減少">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.monthlyChanges} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="net" name="純増" radius={[4, 4, 0, 0]}>
                  {stats.monthlyChanges.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 年間推移 */}
          <ChartCard title="年間推移（過去5年）" subtitle="年毎の開始件数 / 終了件数">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.yearly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a3a3a3' }} />
                <Bar dataKey="started" name="開始" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ended"   name="終了" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  )
}

function StatCard({ label, sub, value, tone }: { label: string; sub?: string; value: number; tone?: 'ok' | 'warn' | 'muted' }) {
  const color =
    tone === 'ok'    ? 'text-emerald-300' :
    tone === 'warn'  ? 'text-amber-300'   :
    tone === 'muted' ? 'text-rose-300'    :
    'text-[#ededed]'
  return (
    <div className="rounded-xl px-4 py-3 bg-[#141414] border border-[rgba(255,255,255,0.06)]">
      <p className="text-[10px] uppercase tracking-wide text-[#a3a3a3] font-bold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
      {sub && <p className="text-[10px] text-[#666] mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-[11px] text-[#666] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs bg-[#262626] border border-[#333]">
      <p className="mb-1 text-[#a3a3a3]">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.fill || '#fff' }}>
          {p.name}: {Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  )
}
