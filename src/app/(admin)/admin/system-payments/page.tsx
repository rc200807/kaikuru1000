'use client'

// システム決済: 各店舗がシステム上で支払った決済（システム利用料等）の集計・記録閲覧
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ChartCard from '@/components/charts/ChartCard'
import KpiCard from '@/components/charts/KpiCard'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart'
import HBarRanking from '@/components/charts/HBarRanking'
import { CHART_PRIMARY, CHART_SECONDARY } from '@/components/charts/chartColors'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formatYen } from '@/lib/currency'
import { formatJstDate } from '@/lib/datetime'

type Summary = {
  kpis: {
    totalPaidAmount: number
    totalPaidCount: number
    thisMonthPaidAmount: number
    thisMonthPaidCount: number
    unresolvedCount: number
    activeStores: number
  }
  byMonth: { month: string; label: string; paidAmount: number; paidCount: number; failedCount: number }[]
  storeRanking: { storeId: string; name: string; amount: number; count: number }[]
}

type PaymentRow = {
  id: string
  kind: string
  billingMonth: string | null
  description: string
  amount: number
  status: string
  failureMessage: string | null
  paidAt: string | null
  receiptNumber: string | null
  createdAt: string
  store: { id: string; name: string; code: string }
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  paid: { label: '支払い済み', className: 'bg-green-950 text-green-400' },
  pending: { label: '処理中', className: 'bg-blue-950 text-blue-400' },
  failed: { label: '失敗', className: 'bg-red-950 text-red-400' },
  no_card: { label: 'カード未登録', className: 'bg-amber-950 text-amber-400' },
}

const STATUS_FILTERS = [
  { key: '', label: 'すべて' },
  { key: 'paid', label: '支払い済み' },
  { key: 'pending', label: '処理中' },
  { key: 'unresolved', label: '失敗・未登録' },
]

export default function SystemPaymentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sessionUser = session?.user as any

  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(30)
  const [statusFilter, setStatusFilter] = useState('')
  const [loadingRows, setLoadingRows] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated' && !['admin', 'superadmin', 'hr'].includes(sessionUser?.role)) router.push('/')
  }, [status, sessionUser, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/system-payments/summary?months=12')
      .then(r => (r.ok ? r.json() : null))
      .then(setSummary)
  }, [status])

  const loadRows = useCallback(async (p: number, s: string) => {
    setLoadingRows(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (s) params.set('status', s)
      const res = await fetch(`/api/admin/system-payments?${params}`)
      if (res.ok) {
        const d = await res.json()
        setRows(d.payments)
        setTotal(d.total)
        setPage(d.page)
        setPageSize(d.pageSize)
      }
    } finally {
      setLoadingRows(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') loadRows(1, statusFilter)
  }, [status, statusFilter, loadRows])

  if (status === 'loading' || !summary) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" label="読み込み中..." /></div>
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">各店舗がシステム上で支払った決済の集計</p>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">システム決済</h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="決済総額（累計）" value={formatYen(summary.kpis.totalPaidAmount)} />
        <KpiCard label="決済件数（累計）" value={summary.kpis.totalPaidCount.toLocaleString()} unit="件" />
        <KpiCard label="今月の決済額" value={formatYen(summary.kpis.thisMonthPaidAmount)} />
        <KpiCard label="今月の決済件数" value={summary.kpis.thisMonthPaidCount.toLocaleString()} unit="件" />
        <KpiCard label="失敗・カード未登録" value={summary.kpis.unresolvedCount.toLocaleString()} unit="件" />
        <KpiCard label="課金対象店舗" value={summary.kpis.activeStores.toLocaleString()} unit="店舗" />
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="月次決済額の推移">
          <TimeSeriesChart
            data={summary.byMonth.map(m => ({ label: m.label, amount: m.paidAmount }))}
            valueFormat="yen"
            series={[{ key: 'amount', name: '決済額', color: CHART_PRIMARY, type: 'bar' }]}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="月次決済件数（成功・失敗）">
          <TimeSeriesChart
            data={summary.byMonth.map(m => ({ label: m.label, paid: m.paidCount, failed: m.failedCount }))}
            valueFormat="count"
            series={[
              { key: 'paid', name: '成功', color: CHART_SECONDARY, type: 'bar', stackId: 'a' },
              { key: 'failed', name: '失敗・未登録', color: '#f87171', type: 'bar', stackId: 'a' },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard title="店舗別支払額 TOP10（累計）">
        <HBarRanking
          items={summary.storeRanking.map(s => ({ name: s.name, value: s.amount, sub: `${s.count}件` }))}
          valueFormat="yen"
          emptyText="決済データがまだありません"
        />
      </ChartCard>

      {/* 決済記録 */}
      <ChartCard
        title="決済記録"
        aside={
          <div className="flex gap-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  statusFilter === f.key
                    ? 'bg-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-surface)]'
                    : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {loadingRows ? (
          <p className="text-sm py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">決済記録がありません</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                    <th className="py-2 pr-4 font-medium">日時</th>
                    <th className="py-2 pr-4 font-medium">店舗</th>
                    <th className="py-2 pr-4 font-medium">内容</th>
                    <th className="py-2 pr-4 font-medium text-right">金額</th>
                    <th className="py-2 pr-4 font-medium">状態</th>
                    <th className="py-2 font-medium">領収書</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const badge = STATUS_LABEL[r.status] ?? { label: r.status, className: 'bg-gray-800 text-gray-300' }
                    return (
                      <tr key={r.id} className="border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                        <td className="py-2.5 pr-4 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">
                          {formatJstDate(r.paidAt ?? r.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <div className="text-[var(--md-sys-color-on-surface)]">{r.store.name}</div>
                          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{r.store.code}</div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="text-[var(--md-sys-color-on-surface)]">{r.description}</div>
                          {r.failureMessage && (r.status === 'failed' || r.status === 'no_card') && (
                            <div className="text-[11px] text-[var(--md-sys-color-error)] mt-0.5">{r.failureMessage}</div>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-[var(--md-sys-color-on-surface)]">
                          {formatYen(r.amount)}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td className="py-2.5 whitespace-nowrap text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {r.receiptNumber ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => loadRows(page - 1, statusFilter)}
                  className="px-3 py-1 rounded text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-40"
                >
                  前へ
                </button>
                <span className="text-[var(--md-sys-color-on-surface-variant)] tabular-nums">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => loadRows(page + 1, statusFilter)}
                  className="px-3 py-1 rounded text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-40"
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </ChartCard>
    </div>
  )
}
