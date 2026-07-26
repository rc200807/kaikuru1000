'use client'

// 空き家管理案件の全件一覧（管理ポータル）。
import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import DataTable from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
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

const fmtDate = (d: string | null) =>
  d ? formatJstDate(d, { year: '2-digit', month: '2-digit', day: '2-digit' }) : '—'

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>
}

export default function AdminAkiyaCasesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [cases, setCases] = useState<AkiyaCaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [storeFilter, setStoreFilter] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const u = session.user as any
    if (!['admin', 'superadmin', 'hr'].includes(u.role)) { router.push('/'); return }
    fetch('/api/stores')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setStores(Array.isArray(data) ? data.map((s: any) => ({ id: s.id, name: s.name })) : []))
      .catch(() => {})
  }, [status, session, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    const fetchCases = () => {
      setLoading(true)
      fetch(`/api/akiya-cases?limit=200${storeFilter ? `&storeId=${encodeURIComponent(storeFilter)}` : ''}`)
        .then(r => (r.ok ? r.json() : { cases: [] }))
        .then(data => { if (!cancelled) setCases(data.cases ?? []) })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    fetchCases()
    return () => { cancelled = true }
  }, [status, storeFilter])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return cases.filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (q) {
        const hay = [c.user?.name ?? '', c.user?.phone ?? '', c.propertyAddress, c.store?.name ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cases, searchText, filterStatus])

  if (status === 'loading' || (loading && cases.length === 0)) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] pb-16">
      <AppBar title="空き家管理" subtitle={`全${cases.length}件`} />

      <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-3">
        {/* フィルタ行 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
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
              placeholder="検索（顧客名/電話/物件住所/店舗）"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--portal-primary,#374151)]"
            />
          </div>
          <div className="sm:w-64 shrink-0">
            <StoreFilterSelect value={storeFilter} onChange={setStoreFilter} stores={stores} />
          </div>
        </div>

        {/* ステータスチップ */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[{ value: 'all', label: 'すべて' }, ...AKIYA_STATUS_OPTIONS].map(opt => {
            const active = filterStatus === opt.value
            const badge = opt.value !== 'all' ? AKIYA_STATUS_BADGE[opt.value] : null
            const count = opt.value === 'all' ? cases.length : cases.filter(c => c.status === opt.value).length
            return (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`
                  px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 border
                  ${active
                    ? 'border-transparent'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-transparent'
                  }
                `}
                style={active
                  ? badge
                    ? { background: badge.bg, color: badge.fg, borderColor: badge.fg }
                    : { background: 'var(--portal-primary,#374151)', color: '#fff' }
                  : undefined}
              >
                {opt.label} {count}
              </button>
            )
          })}
        </div>

        {/* 一覧テーブル */}
        <DataTable<AkiyaCaseRow>
          columns={[
            {
              key: 'user',
              header: '顧客',
              render: c => (
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">{c.user?.name ?? '—'}</div>
                  {c.user?.phone && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{c.user.phone}</div>}
                </div>
              ),
              sortable: true,
              sortValue: c => c.user?.name ?? '',
            },
            {
              key: 'propertyAddress',
              header: '物件住所',
              render: c => <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.propertyAddress}</span>,
            },
            {
              key: 'store',
              header: '店舗',
              render: c => <span className="text-xs">{c.store?.name ?? '—'}</span>,
              hideOnMobile: true,
              sortable: true,
              sortValue: c => c.store?.name ?? '',
            },
            {
              key: 'plan',
              header: 'プラン',
              render: c => {
                const b = AKIYA_PLAN_BADGE[c.plan] ?? AKIYA_PLAN_BADGE.standard
                return <Badge label={akiyaPlanLabel(c.plan)} bg={b.bg} fg={b.fg} />
              },
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'ステータス',
              render: c => {
                const b = AKIYA_STATUS_BADGE[c.status] ?? AKIYA_STATUS_BADGE.pre_contract
                return <Badge label={akiyaStatusLabel(c.status)} bg={b.bg} fg={b.fg} />
              },
            },
            {
              key: 'lastVisitedAt',
              header: '前回訪問',
              render: c => <span className="text-xs">{c.lastVisitedAt ? fmtDate(c.lastVisitedAt) : '未訪問'}</span>,
              hideOnMobile: true,
              sortable: true,
              sortValue: c => c.lastVisitedAt ?? '',
            },
            {
              key: 'nextVisitAt',
              header: '次回訪問',
              render: c => {
                const overdue = !!c.nextVisitAt && new Date(c.nextVisitAt).getTime() < Date.now()
                return (
                  <span className={`text-xs ${overdue ? 'text-[#dc2626] font-semibold' : ''}`}>
                    {c.nextVisitAt ? `${fmtDate(c.nextVisitAt)}${overdue ? '（超過）' : ''}` : '未定'}
                  </span>
                )
              },
              sortable: true,
              sortValue: c => c.nextVisitAt ?? '',
            },
            {
              key: 'records',
              header: '記録',
              render: c => <span className="text-xs">{c._count?.records ?? 0}件</span>,
              hideOnMobile: true,
              sortable: true,
              sortValue: c => c._count?.records ?? 0,
            },
          ]}
          data={filtered}
          rowKey={c => c.id}
          onRowClick={c => router.push(`/admin/akiya-cases/${c.id}`)}
          emptyTitle={searchText || filterStatus !== 'all' || storeFilter ? '該当する案件がありません' : '空き家管理案件はまだありません'}
          emptyDescription="店舗ポータルの「空き家管理」から案件を作成できます"
        />
      </div>
    </div>
  )
}
