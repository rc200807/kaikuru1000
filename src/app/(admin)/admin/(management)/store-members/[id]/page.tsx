'use client'

// 店舗メンバー詳細: プロフィール + 実績KPI + 月次推移 + 担当訪問/案件 + 操作・ログイン履歴
import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'
import StatusBadge from '@/components/StatusBadge'
import KpiCard from '@/components/charts/KpiCard'
import ChartCard from '@/components/charts/ChartCard'
import ChartTooltip from '@/components/charts/ChartTooltip'
import SectionHeading from '@/components/charts/SectionHeading'
import PageNav from '@/components/list/PageNav'
import { DEAL_STATUS_LABEL, DEAL_STATUS_BADGE } from '@/lib/deal-status'

type MemberDetail = {
  member: {
    id: string; storeId: string; name: string; email: string; avatar: string | null; createdAt: string
    store: { id: string; name: string; code: string; prefecture: string | null }
  }
  stats: {
    totalVisits: number; completedVisits: number
    totalPurchaseAmount: number; currentMonthPurchaseAmount: number
    dealCount: number; estimateCount: number; contractCount: number; purchaseItemCount: number
    loginCount: number; lastLoginAt: string | null
  }
  monthlyTrend: { month: string; visitCount: number; purchaseAmount: number }[]
  recentVisits: {
    id: string; visitDate: string; startTime: string | null; status: string; purchaseAmount: number | null
    store: { id: string; name: string }; user: { id: string; name: string }
  }[]
  recentDeals: {
    id: string; status: string; occurredAt: string; detail: string | null; purchaseAmount: number | null
    store: { id: string; name: string } | null; user: { id: string; name: string }
  }[]
  includesLegacyData: boolean
}

type ActivityItem = { id: string; action: string; ip: string | null; userAgent: string | null; createdAt: string; memberId: string | null }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('ja-JP')
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ACCENT = 'var(--portal-primary, #374151)'

export default function AdminStoreMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { status } = useSession()
  const router = useRouter()

  const [data, setData] = useState<MemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // 操作履歴タイムライン
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [actTotal, setActTotal] = useState(0)
  const [actPage, setActPage] = useState(1)
  const [actFilter, setActFilter] = useState<'all' | 'login' | 'operation'>('all')
  const [actLoading, setActLoading] = useState(false)
  const ACT_LIMIT = 30

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch(`/api/admin/store-members/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.ok ? r.json() : null
      })
      .then(d => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [status, id])

  useEffect(() => {
    if (status !== 'authenticated') return
    setActLoading(true)
    const qs = new URLSearchParams({ page: String(actPage), limit: String(ACT_LIMIT) })
    if (actFilter !== 'all') qs.set('action', actFilter)
    fetch(`/api/admin/store-members/${id}/activity?${qs}`)
      .then(r => r.ok ? r.json() : { items: [], total: 0 })
      .then(d => { setActivity(d.items || []); setActTotal(d.total ?? 0) })
      .finally(() => setActLoading(false))
  }, [status, id, actPage, actFilter])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (notFound || !data) {
    return (
      <div className="p-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        メンバーが見つかりません。
        <Link href="/admin/store-members" className="underline ml-2">一覧へ戻る</Link>
      </div>
    )
  }

  const { member, stats, monthlyTrend, recentVisits, recentDeals, includesLegacyData } = data
  const actPageCount = Math.max(1, Math.ceil(actTotal / ACT_LIMIT))

  return (
    <div className="px-5 py-5 text-[var(--md-sys-color-on-surface)]">
      {/* パンくず + ヘッダー */}
      <Link href="/admin/store-members" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline">
        ← 店舗メンバー一覧
      </Link>
      <div className="flex items-center gap-4 mt-3 mb-6 flex-wrap">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center flex-none">
          {member.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-[var(--md-sys-color-on-surface-variant)]">
              {(member.name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold m-0">{member.name}</h1>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] m-0 mt-0.5">
            <a href={`mailto:${member.email}`} className="hover:underline">{member.email}</a>
            <span className="mx-2">·</span>
            所属:{' '}
            <Link href={`/admin/stores/${member.store.id}`} className="underline">
              {member.store.name}
            </Link>
            {member.store.prefecture && <span className="opacity-70">（{member.store.prefecture}）</span>}
            <span className="mx-2">·</span>
            登録日: {fmtDate(member.createdAt)}
          </p>
        </div>
      </div>

      {includesLegacyData && (
        <MessageBanner severity="info" className="mb-5">
          memberId導入（2026年7月）以前のデータは担当者名による照合の参考値です。同名メンバーがいた場合は誤差が生じることがあります。
        </MessageBanner>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="担当訪問（完了/総数）" value={`${stats.completedVisits.toLocaleString()} / ${stats.totalVisits.toLocaleString()}`} unit="件" />
        <KpiCard
          label="買取金額 累計"
          value={`¥${stats.totalPurchaseAmount.toLocaleString()}`}
          sub={`当月: ¥${stats.currentMonthPurchaseAmount.toLocaleString()}`}
        />
        <KpiCard label="作成案件" value={stats.dealCount.toLocaleString()} unit="件" sub={`買取品目 ${stats.purchaseItemCount.toLocaleString()}点`} />
        <KpiCard label="見積 / 契約" value={`${stats.estimateCount.toLocaleString()} / ${stats.contractCount.toLocaleString()}`} unit="件" />
        <KpiCard label="ログイン回数" value={stats.loginCount.toLocaleString()} unit="回" sub={`最終: ${fmtDateTime(stats.lastLoginAt)}`} />
      </div>

      {/* 月次推移 */}
      <SectionHeading title="月次推移（直近12ヶ月）" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="買取金額">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="memberAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)} />
                <Tooltip content={<ChartTooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />} />
                <Area type="monotone" dataKey="purchaseAmount" name="買取金額" stroke={ACCENT} strokeWidth={2} fill="url(#memberAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="訪問件数">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="memberVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}件`} />} />
                <Area type="monotone" dataKey="visitCount" name="訪問件数" stroke={ACCENT} strokeWidth={2} fill="url(#memberVisits)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* 担当訪問 / 作成案件 */}
      <SectionHeading title="担当訪問（直近20件）" />
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-x-auto">
        {recentVisits.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-10">担当した訪問がありません</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left px-4 py-2.5 font-medium">訪問日</th>
                <th className="text-left px-4 py-2.5 font-medium">顧客</th>
                <th className="text-left px-4 py-2.5 font-medium">店舗</th>
                <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
                <th className="text-right px-4 py-2.5 font-medium">買取金額</th>
              </tr>
            </thead>
            <tbody>
              {recentVisits.map(v => (
                <tr
                  key={v.id}
                  onClick={() => router.push(`/admin/visits/${v.id}`)}
                  className="border-b border-[var(--md-sys-color-surface-container-high)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                    {fmtDate(v.visitDate)}{v.startTime ? ` ${v.startTime}` : ''}
                  </td>
                  <td className="px-4 py-2.5">{v.user.name}</td>
                  <td className="px-4 py-2.5 text-[var(--md-sys-color-on-surface-variant)]">{v.store.name}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={v.status as any} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {v.purchaseAmount != null ? `¥${v.purchaseAmount.toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SectionHeading title="作成した案件（直近20件）" />
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-x-auto">
        {recentDeals.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-10">作成した案件がありません</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                <th className="text-left px-4 py-2.5 font-medium">発生日</th>
                <th className="text-left px-4 py-2.5 font-medium">顧客</th>
                <th className="text-left px-4 py-2.5 font-medium">内容</th>
                <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
                <th className="text-right px-4 py-2.5 font-medium">買取金額</th>
              </tr>
            </thead>
            <tbody>
              {recentDeals.map(d => {
                const badge = DEAL_STATUS_BADGE[d.status]
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/admin/deals?deal=${d.id}`)}
                    className="border-b border-[var(--md-sys-color-surface-container-high)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{fmtDate(d.occurredAt)}</td>
                    <td className="px-4 py-2.5">{d.user.name}</td>
                    <td className="px-4 py-2.5 text-[var(--md-sys-color-on-surface-variant)] max-w-56 truncate">{d.detail || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: badge?.bg, color: badge?.fg }}>
                        {DEAL_STATUS_LABEL[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.purchaseAmount != null ? `¥${d.purchaseAmount.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 操作・ログイン履歴 */}
      <SectionHeading
        title="操作・ログイン履歴"
        sub={`${actTotal.toLocaleString()}件`}
        aside={
          <div className="flex gap-1.5">
            {([['all', 'すべて'], ['login', 'ログイン'], ['operation', '操作']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setActFilter(key); setActPage(1) }}
                className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                  actFilter === key
                    ? 'border-[var(--portal-primary,#374151)] bg-[color-mix(in_srgb,var(--portal-primary,#374151)_10%,transparent)]'
                    : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
        {actLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : activity.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-10">履歴がありません</p>
        ) : (
          <ul className="divide-y divide-[var(--md-sys-color-surface-container-high)]">
            {activity.map(a => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`w-2 h-2 rounded-full flex-none ${a.action === 'login' ? 'bg-blue-400' : 'bg-green-500'}`} />
                <span className="flex-1 min-w-0 truncate">{a.action}</span>
                {a.memberId == null && (
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] rounded-full px-1.5 flex-none" title="担当者名による照合（参考値）">
                    参考
                  </span>
                )}
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-none tabular-nums">{a.ip || ''}</span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-none tabular-nums">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {actPageCount > 1 && (
          <div className="pb-4">
            <PageNav page={actPage} pageCount={actPageCount} onChange={setActPage} />
          </div>
        )}
      </div>
    </div>
  )
}
