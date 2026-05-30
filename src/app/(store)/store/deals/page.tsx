'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import { DEAL_STATUSES, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'

type Deal = {
  id: string
  detail: string | null
  status: string
  createdAt: string
  user: { id: string; name: string; phone: string; customerType: string } | null
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

export default function StoreDealsPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [stats, setStats] = useState<{ counts: Record<string, number>; total: number } | null>(null)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus === 'authenticated') { fetchDeals(); fetchStats() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus])

  async function fetchDeals() {
    setLoading(true)
    try {
      const res = await fetch(`/api/deals?limit=200`)
      if (res.ok) {
        const data = await res.json()
        setDeals(data.deals ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`/api/deals?stats=1`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats ?? null)
      }
    } catch {
      // ignore
    }
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return deals.filter(d => {
      if (filterStatus !== 'all' && d.status !== filterStatus) return false
      if (q) {
        const hay = [d.user?.name ?? '', d.user?.phone ?? '', d.detail ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [deals, searchText, filterStatus])

  const wonCount = (stats?.counts.contract ?? 0) + (stats?.counts.completed ?? 0)
  const statsTotal = stats?.total ?? 0
  const winRate = statsTotal > 0 ? Math.round((wonCount / statsTotal) * 1000) / 10 : 0

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar title="案件一覧" />

      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {/* 成約率・ステータス別件数サマリー */}
        {stats && (
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 flex items-center gap-4 flex-wrap">
            <div className="shrink-0">
              <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">
                {winRate}<span className="text-base font-semibold">%</span>
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">成約率（契約+完了 / 全{statsTotal}件）</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEAL_STATUSES.map(s => {
                const badge = DEAL_STATUS_BADGE[s]
                return (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.fg }}>
                    {DEAL_STATUS_LABEL[s]} {stats.counts[s] ?? 0}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* 検索 + ステータスフィルタ */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="検索（顧客名/電話/メモ）"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[{ value: 'all', label: 'すべて' }, ...DEAL_STATUSES.map(s => ({ value: s, label: DEAL_STATUS_LABEL[s] }))].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`
                  px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0
                  ${filterStatus === opt.value
                    ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* リスト */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {searchText || filterStatus !== 'all' ? '該当する案件がありません' : '案件はまだありません'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(deal => {
              const badge = DEAL_STATUS_BADGE[deal.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
              return (
                <button
                  key={deal.id}
                  onClick={() => deal.user && router.push(`/store/customers/${deal.user.id}?tab=deals`)}
                  className="text-left rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4 hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: badge.bg, color: badge.fg }}
                      >
                        {DEAL_STATUS_LABEL[deal.status as DealStatus] ?? deal.status}
                      </span>
                      {deal.inquiry && (
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">問い合わせ由来</span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--md-sys-color-outline)] whitespace-nowrap">
                      {format(new Date(deal.createdAt), 'yyyy/M/d', { locale: ja })}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                    {deal.user?.name ?? '—'}
                  </div>
                  {deal.detail && (
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap line-clamp-2">
                      {deal.detail}
                    </p>
                  )}
                  {(deal._count?.visitSchedules ?? 0) > 0 && (
                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                      訪問予定 {deal._count?.visitSchedules}件
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
