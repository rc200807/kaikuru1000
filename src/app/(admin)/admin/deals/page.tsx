'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import DataTable from '@/components/DataTable'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import ViewTabs, { type ListView } from '@/components/list/ViewTabs'
import FilterChipBar from '@/components/list/FilterChipBar'
import AdvancedFilterPanel from '@/components/list/AdvancedFilterPanel'
import ColumnPicker from '@/components/list/ColumnPicker'
import BulkActionBar from '@/components/list/BulkActionBar'
import PageNav from '@/components/list/PageNav'
import { useListQueryState, serializeParams } from '@/hooks/useListQueryState'
import {
  dealChips, dealAdvFields, DEAL_PRESET_VIEWS, DEAL_FILTER_PARAM_KEYS, parseDealFilterString,
} from '@/components/list/deal-filter-defs'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'

type Deal = {
  id: string
  detail: string | null
  status: string
  category: string | null
  createdAt: string
  occurredAt: string
  purchaseAmount: number | null
  inquiryId?: string | null
  user: { id: string; name: string; phone: string | null; customerType: string; leadSource: string | null } | null
  store: { id: string; name: string; code: string } | null
  inquiry: { id: string; inquiryType: string } | null
  member: { id: string; name: string } | null
  salesContract: { id: string } | null
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
const QUERY_PARAM_KEYS = [...DEAL_FILTER_PARAM_KEYS, 'page'] as const
const COLS_STORAGE_KEY = 'kk-admin-deals-cols'

// 切替可能な列（顧客名・ステータスは常時表示）
const COLUMN_OPTIONS = [
  { key: 'store', label: '店舗' },
  { key: 'category', label: 'カテゴリー' },
  { key: 'amount', label: '買取金額' },
  { key: 'createdAt', label: '作成日' },
  { key: 'leadSource', label: '流入経路' },
  { key: 'customerType', label: '顧客種別' },
  { key: 'member', label: '担当' },
  { key: 'source', label: '由来' },
  { key: 'visits', label: '訪問数' },
  { key: 'contract', label: '契約書' },
]
const COLUMN_KEYS = COLUMN_OPTIONS.map(c => c.key)
const DEFAULT_COLS = ['store', 'category', 'amount', 'createdAt']

// テーブル列キー → サーバーソートフィールド
const SORT_FIELD_BY_COL: Record<string, string> = { createdAt: 'createdAt', amount: 'purchaseAmount' }
const COL_BY_SORT_FIELD: Record<string, string> = { createdAt: 'createdAt', purchaseAmount: 'amount' }

const yen = (n: number | null | undefined) => (n == null ? '—' : '¥' + n.toLocaleString())
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit' })

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>
}

export default function AdminDealsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [deals, setDeals] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [leadSources, setLeadSources] = useState<{ name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; name: string; store?: { name: string } | null }[]>([])

  const { params, setParams, replaceParams, ready } = useListQueryState(QUERY_PARAM_KEYS)
  const filterQuery = serializeParams(params, DEAL_FILTER_PARAM_KEYS)
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const pageCount = Math.max(1, Math.ceil(total / LIMIT))

  const [savedViews, setSavedViews] = useState<ListView[]>([])
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLS)
  const [advOpen, setAdvOpen] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [bulkModal, setBulkModal] = useState<'status' | 'category' | 'member' | null>(null)
  const [bulkValue, setBulkValue] = useState('')

  // ?id= ディープリンク（RecentDealsSidebar等）→ 詳細ページへ
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) router.replace(`/admin/deals/${id}`)
  }, [router])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  // フィルタ選択肢（店舗・流入経路・メンバー）
  useEffect(() => {
    if (status !== 'authenticated') return
    const u = session.user as any
    if (!['admin', 'superadmin', 'hr'].includes(u.role)) { router.push('/'); return }
    Promise.all([
      fetch('/api/stores').then(r => r.ok ? r.json() : []),
      fetch('/api/lead-sources').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/store-members').then(r => r.ok ? r.json() : { members: [] }),
    ]).then(([storesData, leadData, membersData]) => {
      setStores(Array.isArray(storesData) ? storesData.map((s: any) => ({ id: s.id, name: s.name })) : [])
      setLeadSources(Array.isArray(leadData) ? leadData : [])
      setMembers(Array.isArray(membersData?.members) ? membersData.members : [])
    }).catch(() => {})
  }, [status, session, router])

  // 保存ビュー
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/list-views?portal=admin-deals')
      .then(r => r.ok ? r.json() : { views: [] })
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
        if (Array.isArray(arr)) setVisibleCols(arr.filter((k: string) => COLUMN_KEYS.includes(k)))
      }
    } catch { /* ignore */ }
  }, [])

  function updateVisibleCols(cols: string[]) {
    setVisibleCols(cols)
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)) } catch { /* ignore */ }
  }

  // 一覧取得（サーバー側検索・絞り込み・ソート。検索はデバウンス）
  useEffect(() => {
    if (status !== 'authenticated' || !ready) return
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(filterQuery)
      sp.set('page', String(page))
      sp.set('limit', String(LIMIT))
      fetch(`/api/deals?${sp.toString()}`)
        .then(r => r.json())
        .then(data => { setDeals(data?.deals ?? []); setTotal(data?.total ?? 0); setLoading(false) })
        .catch(() => setLoading(false))
    }, params.search?.trim() ? 300 : 0)
    return () => clearTimeout(handle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready, filterQuery, page])

  // フィルタ連動サマリー
  useEffect(() => {
    if (status !== 'authenticated' || !ready) return
    const sp = new URLSearchParams(filterQuery)
    sp.set('stats', '1')
    fetch(`/api/deals?${sp.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setStats(d?.stats ?? null))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready, filterQuery])

  // フィルタ・ページ変更で選択解除
  useEffect(() => { setSelectedIds(new Set()); setAllMatching(false) }, [filterQuery, page])

  // 保存ビュー
  const views: ListView[] = [...DEAL_PRESET_VIEWS, ...savedViews]
  const activeViewId = views.find(v => serializeParams(parseDealFilterString(v.filters), DEAL_FILTER_PARAM_KEYS) === filterQuery)?.id ?? null

  function handleSelectView(v: ListView) {
    replaceParams(parseDealFilterString(v.filters))
    if (v.columns && v.columns.length > 0) updateVisibleCols(v.columns.filter(k => COLUMN_KEYS.includes(k)))
  }
  async function handleSaveView(name: string) {
    const res = await fetch('/api/list-views', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'admin-deals', name, filters: filterQuery, columns: visibleCols }),
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

  // 一括操作
  function handleBulkAction(key: string) {
    if (key === 'export') {
      const qs = allMatching || selectedIds.size === 0
        ? filterQuery
        : `ids=${encodeURIComponent([...selectedIds].join(','))}`
      window.location.href = `/api/deals/export${qs ? `?${qs}` : ''}`
      return
    }
    if (key === 'status' || key === 'category' || key === 'member') {
      setBulkValue(key === 'status' ? 'inquiry' : key === 'category' ? 'purchase' : '')
      setBulkModal(key)
    }
  }
  async function submitBulk() {
    if (!bulkModal) return
    setBulkBusy(bulkModal)
    try {
      const target = (allMatching || selectedIds.size === 0)
        ? { filters: filterQuery }
        : { ids: [...selectedIds] }
      const res = await fetch('/api/deals/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: bulkModal, value: bulkValue, ...target }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '一括操作に失敗しました')
      setMessage({ type: 'success', text: `${d.count}件を更新しました` })
      setBulkModal(null)
      setSelectedIds(new Set()); setAllMatching(false)
      // 再取得
      const sp = new URLSearchParams(filterQuery); sp.set('page', String(page)); sp.set('limit', String(LIMIT))
      fetch(`/api/deals?${sp.toString()}`).then(r => r.json()).then(data => { setDeals(data?.deals ?? []); setTotal(data?.total ?? 0) })
      const sp2 = new URLSearchParams(filterQuery); sp2.set('stats', '1')
      fetch(`/api/deals?${sp2.toString()}`).then(r => r.ok ? r.json() : null).then(d2 => setStats(d2?.stats ?? null))
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '一括操作に失敗しました' })
    } finally {
      setBulkBusy(null)
    }
  }

  // 列定義
  const allColumns = useMemo(() => {
    const cols: any[] = [
      { key: 'name', header: '顧客名', render: (d: Deal) => <span className="font-semibold">{d.user?.name ?? '—'}</span> },
      { key: 'status', header: 'ステータス', render: (d: Deal) => { const c = DEAL_STATUS_BADGE[d.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry; return <Badge label={DEAL_STATUS_LABEL[d.status as DealStatus] ?? d.status} bg={c.bg} fg={c.fg} /> } },
      { key: 'store', header: '店舗', render: (d: Deal) => <span className="text-sm">{d.store?.name ?? '未割当'}</span> },
      { key: 'category', header: 'カテゴリー', render: (d: Deal) => { const c = DEAL_CATEGORY_BADGE[d.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase; return <Badge label={DEAL_CATEGORY_LABEL[d.category ?? 'purchase'] ?? d.category ?? ''} bg={c.bg} fg={c.fg} /> } },
      { key: 'amount', header: '買取金額', sortable: true, render: (d: Deal) => <span className="tabular-nums">{yen(d.purchaseAmount)}</span> },
      { key: 'createdAt', header: '作成日', sortable: true, render: (d: Deal) => <span className="text-sm tabular-nums">{fmtDate(d.createdAt)}</span> },
      { key: 'leadSource', header: '流入経路', render: (d: Deal) => <span className="text-sm">{d.user?.leadSource || '—'}</span> },
      { key: 'customerType', header: '顧客種別', render: (d: Deal) => <span className="text-sm">{d.user?.customerType ? ((CUSTOMER_TYPE_LABEL as Record<string, string>)[d.user.customerType] ?? d.user.customerType) : '—'}</span> },
      { key: 'member', header: '担当', render: (d: Deal) => <span className="text-sm">{d.member?.name ?? '—'}</span> },
      { key: 'source', header: '由来', render: (d: Deal) => <span className="text-sm">{d.inquiryId ? '問い合わせ' : '手動'}</span> },
      { key: 'visits', header: '訪問数', render: (d: Deal) => <span className="text-sm tabular-nums">{d._count?.visitSchedules ?? 0}</span> },
      { key: 'contract', header: '契約書', render: (d: Deal) => <span className="text-sm">{d.salesContract ? 'あり' : '—'}</span> },
    ]
    return cols
  }, [])

  const displayedColumns = useMemo(() => {
    const alwaysFirst = allColumns.filter(c => c.key === 'name')
    const statusCol = allColumns.filter(c => c.key === 'status')
    const optional = visibleCols.map(k => allColumns.find(c => c.key === k)).filter(Boolean)
    return [...alwaysFirst, ...optional, ...statusCol]
  }, [allColumns, visibleCols])

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</span></div>
  }

  return (
    <>
      <AppBar title="案件管理" subtitle="全店舗の案件をあらゆる条件で検索・絞り込み" />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {message && (
          <MessageBanner severity={message.type} className="mb-4" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        <ViewTabs views={views} activeId={activeViewId} dirty={false} onSelect={handleSelectView} onSaveCurrent={handleSaveView} onDelete={handleDeleteView} />

        {/* 検索 + アクション */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={params.search || ''}
              onChange={e => setParams({ search: e.target.value })}
              placeholder="顧客名・電話・メモで検索..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <ColumnPicker options={COLUMN_OPTIONS} visible={visibleCols} onChange={updateVisibleCols} />
            <Button variant="outlined" onClick={() => handleBulkAction('export')}>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 7.5m0 0l4.5 4.5M12 7.5V21" />
                </svg>
                CSVエクスポート
              </span>
            </Button>
          </div>
        </div>

        {/* クイックフィルタチップ */}
        <div className="mb-3">
          <FilterChipBar
            chips={dealChips(stores, leadSources)}
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
          <SummaryStat label="平均買取" value={yen(stats?.filtered.purchaseAvg ?? 0)} />
          <SummaryStat label="成約率" value={`${stats?.winRate ?? 0}%`} sub={`契約+完了 / 全${stats?.total ?? 0}件`} />
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {DEAL_STATUS_ORDER.map(s => {
              const c = DEAL_STATUS_BADGE[s]
              return <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg }}>{DEAL_STATUS_LABEL[s]} {stats?.counts[s] ?? 0}</span>
            })}
          </div>
        </div>

        {/* 一括操作バー */}
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
            { key: 'export', label: 'CSVエクスポート' },
          ]}
          onAction={handleBulkAction}
          busyAction={bulkBusy}
        />

        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden">
          <DataTable<Deal>
            columns={displayedColumns}
            data={deals}
            rowKey={(d) => d.id}
            onRowClick={(d) => router.push(`/admin/deals/${d.id}`)}
            emptyTitle={loading ? '読み込み中...' : '該当する案件がありません'}
            selectable
            selectedKeys={allMatching ? new Set(deals.map(d => d.id)) : selectedIds}
            onSelectionChange={(keys) => { setSelectedIds(keys); setAllMatching(false) }}
            serverSort={serverSort}
            onSortChange={handleSortChange}
          />
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
        fields={dealAdvFields(stores, leadSources, members)}
        values={params}
        onApply={(patch) => setParams(patch)}
        fetchCount={async (draft) => {
          const qs = serializeParams({ ...params, ...draft }, DEAL_FILTER_PARAM_KEYS)
          const res = await fetch(`/api/deals?page=1&limit=1${qs ? `&${qs}` : ''}`)
          const d = await res.json()
          return d?.total ?? 0
        }}
      />

      {/* 一括操作モーダル */}
      <Modal
        open={bulkModal !== null}
        onClose={() => setBulkModal(null)}
        title={bulkModal === 'status' ? 'ステータスを一括変更' : bulkModal === 'category' ? 'カテゴリーを一括変更' : '担当メンバーを一括変更'}
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {(allMatching || selectedIds.size === 0) ? '絞り込み結果の全件' : `選択した${selectedIds.size}件`}に適用します。
          </p>
          {bulkModal === 'status' && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] text-sm">
              {DEAL_STATUS_ORDER.map(s => <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>)}
            </select>
          )}
          {bulkModal === 'category' && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] text-sm">
              {DEAL_CATEGORIES.map(c => <option key={c} value={c}>{DEAL_CATEGORY_LABEL[c]}</option>)}
            </select>
          )}
          {bulkModal === 'member' && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] text-sm">
              <option value="">（担当を解除）</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.store?.name ? `${m.name}（${m.store.name}）` : m.name}</option>)}
            </select>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outlined" onClick={() => setBulkModal(null)}>キャンセル</Button>
            <Button onClick={submitBulk} disabled={bulkBusy !== null}>{bulkBusy ? '適用中...' : '適用'}</Button>
          </div>
        </div>
      </Modal>
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
