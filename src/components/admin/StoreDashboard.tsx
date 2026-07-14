'use client'

// 管理ポータル: 店舗別ダッシュボード（/admin/stores/[id] のダッシュボードタブ）
// データは /api/admin/stores/[id]/dashboard（店舗ポータルのダッシュボード集計 + 管理専用情報）
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import LoadingSpinner from '@/components/LoadingSpinner'
import KpiCard from '@/components/charts/KpiCard'
import ChartCard from '@/components/charts/ChartCard'
import ChartTooltip from '@/components/charts/ChartTooltip'
import SectionHeading from '@/components/charts/SectionHeading'
import { DEAL_STATUS_LABEL, DEAL_STATUS_BADGE } from '@/lib/deal-status'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'

type DashboardData = {
  myRank: number | null
  totalStores: number
  top10: { rank: number; name: string; isMe: boolean; ratio: number; amount?: number }[]
  currentMonthAmount: number
  currentMonthVisitCount: number
  currentMonthCompletedCount: number
  monthlyPurchaseAmount: { month: string; amount: number }[]
  monthlyVisits: { month: string; count: number }[]
  todayCount: number
  recentDeals: { id: string; customerName: string; address: string; status: string; occurredAt: string; purchaseAmount: number | null }[]
  prevMonthAmount: number
  prevMonthVisitCount: number
  monthlyDeals: { month: string; count: number }[]
  currentMonthDealCount: number
  prevMonthDealCount: number
  dealStatusBreakdown: { status: string; count: number }[]
  totalDeals: number
  contractRate: number
  leadSourceBreakdown: { name: string; count: number }[]
  repeatRate: number
  // 管理専用
  memberPerformance: { memberId: string | null; name: string; avatar: string | null; isForeign: boolean; visitCount: number; completedCount: number; purchaseAmount: number; dealCount: number; lastLoginAt: string | null }[]
  customerTypeBreakdown: { type: string; count: number }[]
  inquiries: { total: number; currentMonth: number }
  accessActivity: { lastLoginAt: string | null; lastLoginName: string | null; logins30d: number; operations30d: number }
  pendingDealCount: number
  visitDecidedCount: number
}

const ACCENT = 'var(--portal-primary, #374151)'
const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#94a3b8']

function momPct(current: number, prev: number): string {
  if (prev === 0) return '—'
  const pct = ((current - prev) / prev) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StoreDashboard({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/stores/${storeId}/dashboard`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [storeId])

  if (loading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>
  }
  if (!data) {
    return <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-16">ダッシュボードの読み込みに失敗しました</p>
  }

  const gridStroke = 'var(--md-sys-color-outline-variant)'

  return (
    <div>
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard
          label="当月買取金額"
          value={`¥${data.currentMonthAmount.toLocaleString()}`}
          sub={`前月比 ${momPct(data.currentMonthAmount, data.prevMonthAmount)}（前月 ¥${data.prevMonthAmount.toLocaleString()}）`}
        />
        <KpiCard
          label="当月訪問（完了/総数）"
          value={`${data.currentMonthCompletedCount} / ${data.currentMonthVisitCount}`}
          unit="件"
          sub={`前月比 ${momPct(data.currentMonthVisitCount, data.prevMonthVisitCount)} ・ 本日 ${data.todayCount}件`}
        />
        <KpiCard
          label="当月新規案件"
          value={String(data.currentMonthDealCount)}
          unit="件"
          sub={`未対応 ${data.pendingDealCount}件 ・ 訪問決定 ${data.visitDecidedCount}件`}
        />
        <KpiCard
          label="全店舗ランキング（当月）"
          value={data.myRank ? `${data.myRank}位` : 'ランク外'}
          unit={`/ ${data.totalStores}店舗`}
          sub={`契約率 ${(data.contractRate * 100).toFixed(0)}% ・ リピート率 ${(data.repeatRate * 100).toFixed(0)}%`}
        />
      </div>

      {/* 管理専用サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <KpiCard label="問い合わせ" value={String(data.inquiries.currentMonth)} unit="件（当月）" sub={`累計 ${data.inquiries.total.toLocaleString()}件`} />
        <KpiCard label="最終ログイン" value={fmtDateTime(data.accessActivity.lastLoginAt)} sub={data.accessActivity.lastLoginName ? `by ${data.accessActivity.lastLoginName}` : undefined} />
        <KpiCard label="直近30日ログイン" value={String(data.accessActivity.logins30d)} unit="回" />
        <KpiCard label="直近30日の操作" value={String(data.accessActivity.operations30d)} unit="回" sub="訪問記録・契約書作成など" />
      </div>

      {/* 推移チャート */}
      <SectionHeading title="推移（直近12ヶ月）" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="買取金額推移">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyPurchaseAmount} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sdAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)} />
                <Tooltip content={<ChartTooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />} />
                <Area type="monotone" dataKey="amount" name="買取金額" stroke={ACCENT} strokeWidth={2} fill="url(#sdAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="訪問件数推移">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyVisits} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sdVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}件`} />} />
                <Area type="monotone" dataKey="count" name="訪問件数" stroke={ACCENT} strokeWidth={2} fill="url(#sdVisits)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="案件数推移">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyDeals} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sdDeals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}件`} />} />
                <Area type="monotone" dataKey="count" name="案件数" stroke={ACCENT} strokeWidth={2} fill="url(#sdDeals)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="案件ステータス割合" aside={<span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">全{data.totalDeals}件</span>}>
          <div className="h-52 flex items-center">
            {data.dealStatusBreakdown.length === 0 ? (
              <p className="w-full text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">案件がありません</p>
            ) : (
              <>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.dealStatusBreakdown}
                      dataKey="count"
                      nameKey="status"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {data.dealStatusBreakdown.map((entry, i) => (
                        <Cell key={entry.status} fill={DEAL_STATUS_BADGE[entry.status]?.fg ?? PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v, name) => `${DEAL_STATUS_LABEL[name] ?? name}: ${v}件`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1.5 text-xs">
                  {data.dealStatusBreakdown.map((s, i) => (
                    <li key={s.status} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: DEAL_STATUS_BADGE[s.status]?.fg ?? PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 text-[var(--md-sys-color-on-surface-variant)]">{DEAL_STATUS_LABEL[s.status] ?? s.status}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </ChartCard>
      </div>

      {/* メンバー実績（管理専用） */}
      <SectionHeading title="メンバー別 当月実績" sub="行クリックでメンバー詳細へ。（他店）表記は店舗切替で作業したメンバー" />
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-x-auto">
        {data.memberPerformance.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-10">メンバーが登録されていません</p>
        ) : (
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left px-4 py-2.5 font-medium">メンバー</th>
                <th className="text-right px-4 py-2.5 font-medium">訪問（完了/総数）</th>
                <th className="text-right px-4 py-2.5 font-medium">買取金額</th>
                <th className="text-right px-4 py-2.5 font-medium">作成案件</th>
                <th className="text-right px-4 py-2.5 font-medium">最終ログイン</th>
              </tr>
            </thead>
            <tbody>
              {data.memberPerformance.map((m, i) => (
                <tr
                  key={m.memberId ?? `name-${i}`}
                  onClick={() => { if (m.memberId && !m.isForeign) router.push(`/admin/store-members/${m.memberId}`) }}
                  className={`border-b border-[var(--md-sys-color-surface-container-high)] ${m.memberId && !m.isForeign ? 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{m.name}</span>
                    {!m.memberId && <span className="ml-1.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-1.5" title="担当者名のみの記録（メンバー未登録または旧データ）">名前照合</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.completedCount} / {m.visitCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">¥{m.purchaseAmount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.dealCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{fmtDateTime(m.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ランキング・内訳 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <ChartCard title="全店舗ランキング TOP10（当月買取金額）">
          {data.top10.length === 0 ? (
            <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-8">当月の実績がまだありません</p>
          ) : (
            <ul className="space-y-2">
              {data.top10.map(r => (
                <li key={r.rank} className="flex items-center gap-2 text-xs">
                  <span className={`w-6 text-right tabular-nums font-bold flex-none ${r.rank <= 3 ? 'text-amber-500' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{r.rank}</span>
                  <span className={`w-28 truncate flex-none ${r.isMe ? 'font-bold' : ''}`}>{r.name}{r.isMe ? ' ★' : ''}</span>
                  <span className="flex-1 h-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, r.ratio * 100)}%`, background: ACCENT, opacity: r.isMe ? 1 : 0.45 }} />
                  </span>
                  {r.amount != null && <span className="w-20 text-right tabular-nums flex-none text-[var(--md-sys-color-on-surface-variant)]">¥{r.amount.toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="顧客タイプ内訳">
          {data.customerTypeBreakdown.length === 0 ? (
            <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-8">顧客がいません</p>
          ) : (
            <ul className="space-y-2">
              {(() => {
                const total = data.customerTypeBreakdown.reduce((s, t) => s + t.count, 0)
                return data.customerTypeBreakdown.map((t, i) => (
                  <li key={t.type} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="w-20 flex-none text-[var(--md-sys-color-on-surface-variant)]">{CUSTOMER_TYPE_LABEL[t.type as keyof typeof CUSTOMER_TYPE_LABEL] ?? t.type}</span>
                    <span className="flex-1 h-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${total > 0 ? Math.max(2, (t.count / total) * 100) : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </span>
                    <span className="w-12 text-right tabular-nums flex-none">{t.count}名</span>
                  </li>
                ))
              })()}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="流入経路">
          {data.leadSourceBreakdown.length === 0 ? (
            <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-8">データがありません</p>
          ) : (
            <ul className="space-y-2">
              {(() => {
                const total = data.leadSourceBreakdown.reduce((s, t) => s + t.count, 0)
                return data.leadSourceBreakdown.slice(0, 8).map((t, i) => (
                  <li key={t.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="w-20 truncate flex-none text-[var(--md-sys-color-on-surface-variant)]">{t.name}</span>
                    <span className="flex-1 h-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${total > 0 ? Math.max(2, (t.count / total) * 100) : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </span>
                    <span className="w-12 text-right tabular-nums flex-none">{t.count}名</span>
                  </li>
                ))
              })()}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* 直近の案件 */}
      <SectionHeading title="直近の案件（最大10件）" />
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-x-auto">
        {data.recentDeals.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-10">案件がありません</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left px-4 py-2.5 font-medium">発生日</th>
                <th className="text-left px-4 py-2.5 font-medium">顧客</th>
                <th className="text-left px-4 py-2.5 font-medium">住所</th>
                <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
                <th className="text-right px-4 py-2.5 font-medium">買取金額</th>
              </tr>
            </thead>
            <tbody>
              {data.recentDeals.map(d => {
                const badge = DEAL_STATUS_BADGE[d.status]
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/admin/deals?deal=${d.id}`)}
                    className="border-b border-[var(--md-sys-color-surface-container-high)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{new Date(d.occurredAt).toLocaleDateString('ja-JP')}</td>
                    <td className="px-4 py-2.5">{d.customerName}</td>
                    <td className="px-4 py-2.5 text-[var(--md-sys-color-on-surface-variant)] max-w-52 truncate">{d.address}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: badge?.bg, color: badge?.fg }}>
                        {DEAL_STATUS_LABEL[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.purchaseAmount != null ? `¥${d.purchaseAmount.toLocaleString()}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
