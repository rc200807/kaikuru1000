'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import DataTable from '@/components/DataTable'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import ViewTabs, { type ListView } from '@/components/list/ViewTabs'
import FilterChipBar from '@/components/list/FilterChipBar'
import AdvancedFilterPanel from '@/components/list/AdvancedFilterPanel'
import ColumnPicker from '@/components/list/ColumnPicker'
import BulkActionBar from '@/components/list/BulkActionBar'
import PageNav from '@/components/list/PageNav'
import BulkDealModal from './BulkDealModal'
import { useListQueryState, serializeParams } from '@/hooks/useListQueryState'
import { useStoreScope } from '@/components/store/StoreScopeContext'
import {
  storeDealChips,
  storeDealAdvFields,
  storeDealPresetViews,
  parseStoreDealFilterString,
} from '@/components/list/store-deal-filter-defs'
import { STORE_DEAL_FILTER_PARAM_KEYS } from '@/lib/deal-list-query'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import { formatDealNumber } from '@/lib/deal-number'

type NextVisit = { id: string; visitDate: string; startTime: string | null; endTime: string | null }

type Deal = {
  id: string
  dealNumber: string | null
  detail: string | null
  status: string
  category: string | null
  createdAt: string
  occurredAt: string
  updatedAt: string
  purchaseAmount: number | null
  preConsentAt: string | null
  inquiryId?: string | null
  user: { id: string; name: string; phone: string | null; customerType: string; leadSource: string | null } | null
  store: { id: string; name: string; code: string } | null
  inquiry: { id: string; inquiryType: string } | null
  member: { id: string; name: string } | null
  /** 担当者名（メンバー名。未設定なら訪問側の担当者名で補完される。API側で解決） */
  assigneeName?: string | null
  salesContract: { id: string } | null
  visitSchedules?: NextVisit[]
  _count?: { visitSchedules: number }
}

type StatsData = {
  counts: Record<string, number>
  total: number
  won: number
  winRate: number
  filtered: { count: number; purchaseSum: number; purchaseAvg: number }
}

const LIMIT = 50
const QUERY_PARAM_KEYS = [...STORE_DEAL_FILTER_PARAM_KEYS, 'page'] as const
const COLS_STORAGE_KEY = 'kk-store-deals-cols'
const LIST_VIEW_PORTAL = 'store-deals'

/** 切替可能な列（顧客名・ステータスは常時表示）。店舗列は複数店舗スコープのときだけ選べる */
const BASE_COLUMN_OPTIONS = [
  { key: 'nextVisit', label: '次回訪問' },
  { key: 'dealNumber', label: '案件番号' },
  { key: 'phone', label: '電話' },
  { key: 'category', label: 'カテゴリー' },
  { key: 'amount', label: '買取金額' },
  { key: 'member', label: '担当' },
  { key: 'occurredAt', label: '案件発生日' },
  { key: 'createdAt', label: '作成日' },
  { key: 'visits', label: '訪問数' },
  { key: 'contract', label: '契約書' },
  { key: 'preConsent', label: '事前同意' },
  { key: 'leadSource', label: '流入経路' },
]
const DEFAULT_COLS = ['nextVisit', 'dealNumber', 'category', 'amount', 'member']

// テーブル列キー → サーバーソートフィールド
const SORT_FIELD_BY_COL: Record<string, string> = { createdAt: 'createdAt', occurredAt: 'occurredAt', amount: 'purchaseAmount', nextVisit: 'nextVisit' }
const COL_BY_SORT_FIELD: Record<string, string> = { createdAt: 'createdAt', occurredAt: 'occurredAt', purchaseAmount: 'amount', nextVisit: 'nextVisit' }

const yen = (n: number | null | undefined) => (n == null ? '—' : '¥' + n.toLocaleString())
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit' })
const fmtMd = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>
}

export default function StoreDealsPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" fullPage label="読み込み中..." />}>
      <StoreDealsContent />
    </Suspense>
  )
}

function StoreDealsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = useStoreScope()

  const [deals, setDeals] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [leadSources, setLeadSources] = useState<{ name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [customerName, setCustomerName] = useState<string | null>(null)

  const { params, setParams, replaceParams, ready } = useListQueryState(QUERY_PARAM_KEYS)
  const filterQuery = serializeParams(params, STORE_DEAL_FILTER_PARAM_KEYS)
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const pageCount = Math.max(1, Math.ceil(total / LIMIT))

  const [savedViews, setSavedViews] = useState<ListView[]>([])
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLS)
  const [advOpen, setAdvOpen] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [bulkModal, setBulkModal] = useState<'status' | 'category' | 'member' | null>(null)

  const selfMemberId = ((session?.user as any)?.memberId ?? null) as string | null
  // 顧客詳細から「この顧客の案件」で来たとき。フィルタUIには出さず、fetchに直接付ける
  const userId = searchParams.get('userId') || ''
  const userIdQs = userId ? `&userId=${encodeURIComponent(userId)}` : ''
  const scopeQs = scope.scopeQuery ? `&${scope.scopeQuery}` : ''
  const scopeKey = scope.selectedIds.join(',')

  // 複数店舗スコープのときだけ店舗列を選べるようにする
  const columnOptions = useMemo(
    () => (scope.isMulti ? [...BASE_COLUMN_OPTIONS, { key: 'store', label: '店舗' }] : BASE_COLUMN_OPTIONS),
    [scope.isMulti],
  )
  const columnKeys = useMemo(() => columnOptions.map(c => c.key), [columnOptions])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  // フィルタ選択肢（流入経路・店舗メンバー）
  useEffect(() => {
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/lead-sources').then(r => (r.ok ? r.json() : [])),
      fetch('/api/store/members').then(r => (r.ok ? r.json() : [])),
    ]).then(([leadData, memberData]) => {
      setLeadSources(Array.isArray(leadData) ? leadData : [])
      setMembers(Array.isArray(memberData) ? memberData.map((m: any) => ({ id: m.id, name: m.name })) : [])
    }).catch(() => {})
  }, [status])

  // 顧客絞り込み中の顧客名（バナー表示用）
  useEffect(() => {
    if (status !== 'authenticated' || !userId) { setCustomerName(null); return }
    fetch(`/api/users/${userId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCustomerName(d?.name ?? null))
      .catch(() => {})
  }, [status, userId])

  // 保存ビュー
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch(`/api/list-views?portal=${LIST_VIEW_PORTAL}`)
      .then(r => (r.ok ? r.json() : { views: [] }))
      .then(d => setSavedViews((d.views || []).map((v: any) => ({
        id: v.id, name: v.name, filters: v.filters, columns: v.columns ? JSON.parse(v.columns) : null,
      }))))
      .catch(() => {})
  }, [status])

  // 列表示の復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setVisibleCols(arr.filter((k: string) => columnKeys.includes(k)))
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateVisibleCols(cols: string[]) {
    setVisibleCols(cols)
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)) } catch { /* ignore */ }
  }

  // 一覧取得（サーバー側検索・絞り込み・ソート。検索はデバウンス）
  useEffect(() => {
    if (status !== 'authenticated' || !ready || scope.loading) return
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(filterQuery)
      sp.set('page', String(page))
      sp.set('limit', String(LIMIT))
      fetch(`/api/deals?${sp.toString()}${scopeQs}${userIdQs}`)
        .then(r => r.json())
        .then(data => { setDeals(data?.deals ?? []); setTotal(data?.total ?? 0); setLoading(false) })
        .catch(() => setLoading(false))
    }, params.search?.trim() ? 300 : 0)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready, scope.loading, scopeKey, filterQuery, page, userId])

  // フィルタ連動サマリー
  useEffect(() => {
    if (status !== 'authenticated' || !ready || scope.loading) return
    const sp = new URLSearchParams(filterQuery)
    sp.set('stats', '1')
    fetch(`/api/deals?${sp.toString()}${scopeQs}${userIdQs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setStats(d?.stats ?? null))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready, scope.loading, scopeKey, filterQuery, userId])

  // フィルタ・ページ・スコープ変更で選択解除
  useEffect(() => { setSelectedIds(new Set()); setAllMatching(false) }, [filterQuery, page, scopeKey])

  // 保存ビュー（プリセット＋自分の保存分）
  const views: ListView[] = [...storeDealPresetViews(selfMemberId), ...savedViews]
  const activeViewId = views.find(
    v => serializeParams(parseStoreDealFilterString(v.filters), STORE_DEAL_FILTER_PARAM_KEYS) === filterQuery,
  )?.id ?? null

  function handleSelectView(v: ListView) {
    replaceParams(parseStoreDealFilterString(v.filters))
    if (v.columns && v.columns.length > 0) updateVisibleCols(v.columns.filter(k => columnKeys.includes(k)))
  }
  async function handleSaveView(name: string) {
    const res = await fetch('/api/list-views', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: LIST_VIEW_PORTAL, name, filters: filterQuery, columns: visibleCols }),
    })
    if (res.ok) {
      const v = await res.json()
      setSavedViews(prev => [...prev, { id: v.id, name: v.name, filters: v.filters, columns: visibleCols }])
    } else {
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || 'ビューの保存に失敗しました' })
    }
  }
  async function handleDeleteView(v: ListView) {
    if (!confirm(`ビュー「${v.name}」を削除しますか？`)) return
    const res = await fetch(`/api/list-views/${v.id}`, { method: 'DELETE' })
    if (res.ok) setSavedViews(prev => prev.filter(x => x.id !== v.id))
  }

  // ソート
  const [sortField, sortDirRaw] = (params.sort || '').split(':')
  const serverSort = sortField && COL_BY_SORT_FIELD[sortField]
    ? { key: COL_BY_SORT_FIELD[sortField], dir: (sortDirRaw === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
    : null
  function handleSortChange(colKey: string) {
    const field = SORT_FIELD_BY_COL[colKey]
    if (!field) return
    const nextDir = sortField === field && sortDirRaw !== 'desc' ? 'desc' : 'asc'
    setParams({ sort: `${field}:${nextDir}` })
  }

  function refetch() {
    const sp = new URLSearchParams(filterQuery); sp.set('page', String(page)); sp.set('limit', String(LIMIT))
    fetch(`/api/deals?${sp.toString()}${scopeQs}${userIdQs}`)
      .then(r => r.json())
      .then(data => { setDeals(data?.deals ?? []); setTotal(data?.total ?? 0) })
      .catch(() => {})
    const sp2 = new URLSearchParams(filterQuery); sp2.set('stats', '1')
    fetch(`/api/deals?${sp2.toString()}${scopeQs}${userIdQs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setStats(d?.stats ?? null))
      .catch(() => {})
  }

  // 一括操作・CSV
  function handleBulkAction(key: string) {
    if (key === 'export') {
      const base = allMatching || selectedIds.size === 0
        ? `${filterQuery}${userId ? `${filterQuery ? '&' : ''}userId=${encodeURIComponent(userId)}` : ''}`
        : `ids=${encodeURIComponent([...selectedIds].join(','))}`
      const qs = [base, scope.scopeQuery].filter(Boolean).join('&')
      window.location.href = `/api/store/deals/export${qs ? `?${qs}` : ''}`
      return
    }
    if (key === 'status' || key === 'category' || key === 'member') setBulkModal(key)
  }

  async function submitBulk(value: string) {
    if (!bulkModal) return
    setBulkBusy(bulkModal)
    try {
      const target = (allMatching || selectedIds.size === 0)
        ? { filters: `${filterQuery}${userId ? `${filterQuery ? '&' : ''}userId=${encodeURIComponent(userId)}` : ''}` }
        : { ids: [...selectedIds] }
      const res = await fetch('/api/store/deals/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: bulkModal, value, ...target }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '一括操作に失敗しました')
      setMessage({ type: 'success', text: `${d.count}件を更新しました` })
      setBulkModal(null)
      setSelectedIds(new Set()); setAllMatching(false)
      refetch()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '一括操作に失敗しました' })
    } finally {
      setBulkBusy(null)
    }
  }

  // 列定義
  const allColumns = useMemo(() => ([
    { key: 'name', header: '顧客名', render: (d: Deal) => (
      <div className="min-w-0">
        <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{d.user?.name ?? '—'}</span>
        {d.detail && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[220px]">{d.detail.replace(/\s+/g, ' ')}</div>}
      </div>
    ) },
    { key: 'status', header: 'ステータス', render: (d: Deal) => {
      const c = DEAL_STATUS_BADGE[d.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
      return <Badge label={DEAL_STATUS_LABEL[d.status as DealStatus] ?? d.status} bg={c.bg} fg={c.fg} />
    } },
    { key: 'nextVisit', header: '次回訪問', sortable: true, render: (d: Deal) => {
      const v = d.visitSchedules?.[0]
      if (!v) return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">—</span>
      return (
        <span className="text-sm tabular-nums whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
          {fmtMd(v.visitDate)}{v.startTime ? ` ${v.startTime}` : ''}
        </span>
      )
    } },
    { key: 'dealNumber', header: '案件番号', render: (d: Deal) => <span className="text-xs tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{formatDealNumber(d.dealNumber)}</span> },
    { key: 'phone', header: '電話', render: (d: Deal) => <span className="text-sm tabular-nums">{d.user?.phone || '—'}</span> },
    { key: 'category', header: 'カテゴリー', render: (d: Deal) => {
      const c = DEAL_CATEGORY_BADGE[d.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase
      return <Badge label={DEAL_CATEGORY_LABEL[d.category ?? 'purchase'] ?? d.category ?? ''} bg={c.bg} fg={c.fg} />
    } },
    { key: 'amount', header: '買取金額', sortable: true, render: (d: Deal) => <span className="tabular-nums">{yen(d.purchaseAmount)}</span> },
    { key: 'member', header: '担当', render: (d: Deal) => <span className="text-sm">{d.assigneeName ?? d.member?.name ?? '—'}</span> },
    { key: 'occurredAt', header: '案件発生日', sortable: true, render: (d: Deal) => <span className="text-sm tabular-nums">{fmtDate(d.occurredAt)}</span> },
    { key: 'createdAt', header: '作成日', sortable: true, render: (d: Deal) => <span className="text-sm tabular-nums">{fmtDate(d.createdAt)}</span> },
    { key: 'visits', header: '訪問数', render: (d: Deal) => <span className="text-sm tabular-nums">{d._count?.visitSchedules ?? 0}</span> },
    { key: 'contract', header: '契約書', render: (d: Deal) => <span className="text-sm">{d.salesContract ? 'あり' : '—'}</span> },
    { key: 'preConsent', header: '事前同意', render: (d: Deal) => (
      d.preConsentAt
        ? <span className="text-xs" style={{ color: 'var(--status-completed-text)' }}>取得済み</span>
        : <span className="text-xs" style={{ color: 'var(--status-pending-text)' }}>未取得</span>
    ) },
    { key: 'leadSource', header: '流入経路', render: (d: Deal) => <span className="text-sm">{d.user?.leadSource || '—'}</span> },
    { key: 'customerType', header: '顧客種別', render: (d: Deal) => <span className="text-sm">{d.user?.customerType ? ((CUSTOMER_TYPE_LABEL as Record<string, string>)[d.user.customerType] ?? d.user.customerType) : '—'}</span> },
    { key: 'store', header: '店舗', render: (d: Deal) => <span className="text-sm">{d.store?.name ?? '未割当'}</span> },
  ]), [])

  const displayedColumns = useMemo(() => {
    const first = allColumns.filter(c => c.key === 'name')
    const statusCol = allColumns.filter(c => c.key === 'status')
    const optional = visibleCols.map(k => allColumns.find(c => c.key === k)).filter(Boolean) as typeof allColumns
    return [...first, ...optional, ...statusCol]
  }, [allColumns, visibleCols])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  return (
    <>
      <AppBar
        title="案件"
        subtitle={`${total.toLocaleString()}件${filterQuery || userId ? ' 該当' : ''}${scope.isMulti ? ` ・ ${scope.selectedIds.length}店舗` : ''}`}
        actions={
          <Button size="sm" variant="outlined" onClick={() => router.push('/store/customers')}>
            顧客から案件を作成
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* 顧客で絞り込み中 */}
        {userId && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
            <span className="text-sm text-[var(--md-sys-color-on-surface)]">
              {customerName ? `${customerName} 様` : 'この顧客'}の案件のみ表示中
            </span>
            <Button size="sm" variant="text" onClick={() => router.push('/store/deals')}>解除</Button>
          </div>
        )}

        {message && (
          <MessageBanner severity={message.type} className="mb-4" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        <ViewTabs
          views={views}
          activeId={activeViewId}
          dirty={false}
          onSelect={handleSelectView}
          onSaveCurrent={handleSaveView}
          onDelete={handleDeleteView}
        />

        {/* 検索 + アクション */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={params.search || ''}
              onChange={e => setParams({ search: e.target.value })}
              placeholder="顧客名・電話・案件内容・案件番号で検索..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="hidden md:inline-flex">
              <ColumnPicker options={columnOptions} visible={visibleCols} onChange={updateVisibleCols} />
            </span>
            <Button variant="outlined" size="sm" onClick={() => handleBulkAction('export')}>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 7.5m0 0l4.5 4.5M12 7.5V21" />
                </svg>
                CSV出力
              </span>
            </Button>
          </div>
        </div>

        {/* クイックフィルタチップ */}
        <div className="mb-3">
          <FilterChipBar
            chips={storeDealChips(members, leadSources, scope.services, selfMemberId)}
            values={params}
            onChange={(patch) => setParams(patch)}
            trailing={
              <button
                type="button"
                onClick={() => setAdvOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                詳細フィルター
              </button>
            }
          />
        </div>

        {/* フィルタ連動サマリー */}
        <div className="flex items-center gap-4 flex-wrap mb-3 rounded-xl px-4 py-3 bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
          <SummaryStat label="件数" value={(stats?.filtered.count ?? total).toLocaleString()} unit="件" />
          <SummaryStat label="買取合計" value={yen(stats?.filtered.purchaseSum ?? 0)} />
          <SummaryStat label="平均買取" value={yen(stats?.filtered.purchaseAvg ?? 0)} sub="1案件あたり" />
          <SummaryStat label="成約率" value={`${stats?.winRate ?? 0}%`} sub={`契約+完了 / 全${stats?.total ?? 0}件`} />
          <div className="flex flex-wrap gap-1.5 md:ml-auto">
            {DEAL_STATUS_ORDER.map(s => {
              const c = DEAL_STATUS_BADGE[s]
              const active = (params.statuses || '').split(',').includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setParams({ statuses: active ? '' : s })}
                  className={`text-[11px] px-2 py-0.5 rounded-full transition-opacity ${active ? 'ring-1 ring-current' : 'hover:opacity-80'}`}
                  style={{ background: c.bg, color: c.fg }}
                >
                  {DEAL_STATUS_LABEL[s]} {stats?.counts[s] ?? 0}
                </button>
              )
            })}
          </div>
        </div>

        {/* 一括操作バー（PCのみ） */}
        <div className="hidden md:block">
          <BulkActionBar
            selectedCount={selectedIds.size}
            totalCount={total}
            allMatching={allMatching}
            onSelectAllMatching={() => setAllMatching(true)}
            onClearSelection={() => { setSelectedIds(new Set()); setAllMatching(false) }}
            actions={[
              { key: 'status', label: 'ステータス変更' },
              { key: 'category', label: 'カテゴリー変更' },
              { key: 'member', label: '担当変更' },
              { key: 'export', label: 'CSV出力' },
            ]}
            onAction={handleBulkAction}
            busyAction={bulkBusy}
          />
        </div>

        {/* PC: テーブル */}
        <div className="hidden md:block bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
          <DataTable<Deal>
            columns={displayedColumns as any}
            data={deals}
            rowKey={(d) => d.id}
            onRowClick={(d) => router.push(`/store/deals/${d.id}`)}
            emptyTitle={loading ? '読み込み中...' : '該当する案件がありません'}
            nowrap
            selectable
            selectedKeys={allMatching ? new Set(deals.map(d => d.id)) : selectedIds}
            onSelectionChange={(keys) => { setSelectedIds(keys); setAllMatching(false) }}
            serverSort={serverSort}
            onSortChange={handleSortChange}
          />
        </div>

        {/* モバイル: カード */}
        <div className="md:hidden flex flex-col gap-2">
          {loading && deals.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-8 text-center">読み込み中...</p>
          ) : deals.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-8 text-center">該当する案件がありません</p>
          ) : deals.map(d => {
            const sc = DEAL_STATUS_BADGE[d.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
            const cc = DEAL_CATEGORY_BADGE[d.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase
            const nv = d.visitSchedules?.[0]
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push(`/store/deals/${d.id}`)}
                className="w-full text-left rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-3.5 active:bg-[var(--md-sys-color-surface-container)]"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={DEAL_STATUS_LABEL[d.status as DealStatus] ?? d.status} bg={sc.bg} fg={sc.fg} />
                  <Badge label={DEAL_CATEGORY_LABEL[d.category ?? 'purchase'] ?? ''} bg={cc.bg} fg={cc.fg} />
                  {d.inquiryId && <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">問い合わせ由来</span>}
                  <span className="ml-auto text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{fmtDate(d.occurredAt)}</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">{d.user?.name ?? '—'}</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--md-sys-color-on-surface)]">{yen(d.purchaseAmount)}</span>
                </div>
                {d.detail && (
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 line-clamp-2 whitespace-pre-wrap">{d.detail}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  <span>No.{formatDealNumber(d.dealNumber)}</span>
                  <span>
                    次回訪問: {nv ? `${fmtMd(nv.visitDate)}${nv.startTime ? ` ${nv.startTime}` : ''}` : 'なし'}
                  </span>
                  {(d.assigneeName ?? d.member?.name) && <span>担当 {d.assigneeName ?? d.member?.name}</span>}
                  {scope.isMulti && d.store?.name && <span>{d.store.name}</span>}
                  {!d.preConsentAt && <span style={{ color: 'var(--status-pending-text)' }}>事前同意 未取得</span>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          <PageNav page={page} pageCount={pageCount} onChange={(p) => setParams({ page: String(p) })} />
        </div>
        <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">
          {total.toLocaleString()}件中 {total === 0 ? 0 : (page - 1) * LIMIT + 1}〜{Math.min(page * LIMIT, total)}件を表示
        </p>
      </div>

      {/* 詳細フィルター */}
      <AdvancedFilterPanel
        open={advOpen}
        onClose={() => setAdvOpen(false)}
        fields={storeDealAdvFields(members, leadSources, scope.services, selfMemberId)}
        values={params}
        onApply={(patch) => setParams(patch)}
        description="すべての条件に一致する案件を表示します（AND条件）。"
        fetchCount={async (draft) => {
          const qs = serializeParams({ ...params, ...draft }, STORE_DEAL_FILTER_PARAM_KEYS)
          const res = await fetch(`/api/deals?page=1&limit=1${qs ? `&${qs}` : ''}${scopeQs}${userIdQs}`)
          const d = await res.json()
          return d?.total ?? 0
        }}
      />

      {/* 一括操作モーダル */}
      <BulkDealModal
        mode={bulkModal}
        onClose={() => setBulkModal(null)}
        onSubmit={submitBulk}
        busy={bulkBusy !== null}
        targetLabel={(allMatching || selectedIds.size === 0) ? '絞り込み結果の全件' : `選択した${selectedIds.size}件`}
        members={members}
        services={scope.services}
        scopeNote={scope.isMulti ? '一括変更はログイン中の店舗の案件にのみ適用されます。' : null}
      />
    </>
  )
}

function SummaryStat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">{value}</span>
        {unit && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{sub}</div>}
    </div>
  )
}
