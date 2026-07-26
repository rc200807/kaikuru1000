'use client'

// 空き家管理案件の一覧（店舗ポータル）。アキクル対応店舗のみ利用可。
import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useStoreScope } from '@/components/store/StoreScopeContext'
import { AKIYA_STATUS_OPTIONS, AKIYA_STATUS_BADGE, akiyaStatusLabel } from '@/lib/akiya-status'
import { AKIYA_PLAN_BADGE, akiyaPlanLabel } from '@/lib/akiya-plans'
import { formatJstDate } from '@/lib/datetime'

type AkiyaCaseRow = {
  id: string
  propertyAddress: string
  startDate: string | null
  endDate: string | null
  plan: string
  status: string
  lastVisitedAt: string | null
  nextVisitAt: string | null
  createdAt: string
  user: { id: string; name: string; phone: string | null } | null
  store: { id: string; name: string; code: string } | null
  _count?: { records: number }
}

const fmtDate = (d: string) => formatJstDate(d, { year: 'numeric', month: '2-digit', day: '2-digit' })

export default function StoreAkiyaPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const scope = useStoreScope()
  const scopeKey = scope.selectedIds.join(',')
  const supportsAkikuru = scope.services.includes('akikuru')

  const [cases, setCases] = useState<AkiyaCaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus !== 'authenticated' || scope.loading) return
    if (!supportsAkikuru) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const scopeQs = scope.scopeQuery ? `&${scope.scopeQuery}` : ''
    fetch(`/api/akiya-cases?limit=200${scopeQs}`)
      .then(r => (r.ok ? r.json() : { cases: [] }))
      .then(data => { if (!cancelled) setCases(data.cases ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, scope.loading, scopeKey, supportsAkikuru])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return cases.filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (q) {
        const hay = [c.user?.name ?? '', c.propertyAddress, c.store?.name ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cases, searchText, filterStatus])

  if (authStatus === 'loading' || scope.loading || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  // アキクル非対応店舗への案内
  if (!supportsAkikuru) {
    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
        <AppBar title="空き家管理" />
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4">
          <EmptyState
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
              </svg>
            }
            title="この店舗はアキクルに対応していません"
            description="空き家管理（アキクル）をご利用になるには、店舗の対応サービスにアキクルを追加する必要があります。本部までお問い合わせください。"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar
        title="空き家管理"
        actions={<Button size="sm" onClick={() => router.push('/store/akiya/new')}>＋ 新規案件</Button>}
      />

      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
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
              placeholder="検索（顧客名/物件住所）"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[{ value: 'all', label: 'すべて' }, ...AKIYA_STATUS_OPTIONS].map(opt => (
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
            {searchText || filterStatus !== 'all' ? '該当する案件がありません' : '空き家管理案件はまだありません'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c, i) => {
              const statusBadge = AKIYA_STATUS_BADGE[c.status] ?? AKIYA_STATUS_BADGE.pre_contract
              const planBadge = AKIYA_PLAN_BADGE[c.plan] ?? AKIYA_PLAN_BADGE.standard
              const nextVisitOverdue = !!c.nextVisitAt && new Date(c.nextVisitAt).getTime() < Date.now()
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/store/akiya/${c.id}`)}
                  className="text-left rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4 hover:bg-[var(--md-sys-color-surface-container)] transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: statusBadge.bg, color: statusBadge.fg }}>
                        {akiyaStatusLabel(c.status)}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: planBadge.bg, color: planBadge.fg }}>
                        {akiyaPlanLabel(c.plan)}
                      </span>
                      {scope.isMulti && c.store && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                          {c.store.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--md-sys-color-outline)] whitespace-nowrap">
                      記録 {c._count?.records ?? 0}件
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                    {c.user?.name ?? '—'}
                  </div>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 truncate">
                    {c.propertyAddress}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    <span>前回訪問: {c.lastVisitedAt ? fmtDate(c.lastVisitedAt) : '未訪問'}</span>
                    <span className={nextVisitOverdue ? 'text-[#dc2626] font-semibold' : ''}>
                      次回訪問: {c.nextVisitAt ? `${fmtDate(c.nextVisitAt)}${nextVisitOverdue ? '（超過）' : ''}` : '未定'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
