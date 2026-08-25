'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import WeekSchedulePicker from '@/components/store/WeekSchedulePicker'
import { useBusinessHours } from '@/hooks/useBusinessHours'
import DataTable from '@/components/DataTable'
import type { Column } from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'
import FilterChipBar from '@/components/list/FilterChipBar'
import BulkActionBar from '@/components/list/BulkActionBar'
import ViewTabs, { type ListView } from '@/components/list/ViewTabs'
import ColumnPicker from '@/components/list/ColumnPicker'
import PageNav from '@/components/list/PageNav'
import AdvancedFilterPanel from '@/components/list/AdvancedFilterPanel'
import { useListQueryState, serializeParams } from '@/hooks/useListQueryState'
import {
  storeChips, storeAdvFields, STORE_PRESET_VIEWS, FILTER_PARAM_KEYS, parseFilterString, TYPE_OPTIONS,
} from '@/components/list/customer-filter-defs'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  customerType: string
  createdAt?: string | null
  lastVisitDate?: string | null
  nextVisit?: { visitDate: string; startTime?: string | null } | null
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

// URLと同期するクエリキー（フィルタ + ページ）
const QUERY_PARAM_KEYS = [...FILTER_PARAM_KEYS, 'page'] as const

// 「列を編集」で切り替えられる列（氏名は常時表示）
const STORE_COLUMN_OPTIONS = [
  { key: 'contact', label: '連絡先' },
  { key: 'address', label: '住所' },
  { key: 'customerType', label: 'タイプ' },
  { key: 'createdAt', label: '登録日' },
  { key: 'lastVisit', label: '最終訪問日' },
  { key: 'nextVisit', label: '次回訪問予定' },
]
const STORE_DEFAULT_COLS = STORE_COLUMN_OPTIONS.map(c => c.key)
const COLS_STORAGE_KEY = 'kk-store-customers-cols'

// テーブル列キー → サーバーソートフィールド
const SORT_FIELD_BY_COL: Record<string, string> = { name: 'furigana', createdAt: 'createdAt' }

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const bizHours = useBusinessHours()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  // フィルタ・ソート・ページ状態（URLと双方向同期）
  const { params, setParams, replaceParams, ready } = useListQueryState(QUERY_PARAM_KEYS)
  const [customersTotal, setCustomersTotal] = useState(0)
  const CUSTOMERS_LIMIT = 50
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const pageCount = Math.max(1, Math.ceil(customersTotal / CUSTOMERS_LIMIT))
  const filterQuery = serializeParams(params, FILTER_PARAM_KEYS)

  // マスタ（流入経路）・保存ビュー
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([])
  const [savedViews, setSavedViews] = useState<ListView[]>([])

  // 行選択・一括操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [bulkTypeModal, setBulkTypeModal] = useState(false)
  const [bulkType, setBulkType] = useState('regular')
  const [bulkMsg, setBulkMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 表示列・詳細フィルター
  const [visibleCols, setVisibleCols] = useState<string[]>(STORE_DEFAULT_COLS)
  const [advOpen, setAdvOpen] = useState(false)

  // 新規顧客追加（顧客作成 → 案件作成 → 訪問予定追加 の一連ウィザード）
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1) // 1:顧客 2:案件 3:予定 4:完了
  const [addCustomerForm, setAddCustomerForm] = useState({ lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', email: '', phone: '', postalCode: '', address: '', leadSource: '' })
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string } | null>(null)
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const [dealForm, setDealForm] = useState({ detail: '', occurredAt: todayStr() })
  const [createdDealId, setCreatedDealId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false)
  const [addCustomerMsg, setAddCustomerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [zipLooking, setZipLooking] = useState(false)

  // 郵便番号(7桁)から住所を自動入力
  async function lookupPostal(zip: string) {
    const digits = zip.replace(/[-ー\s]/g, '')
    if (digits.length !== 7) return
    setZipLooking(true)
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${digits}`)
      const data = await res.json()
      if (res.ok && data.address) {
        setAddCustomerForm(f => ({ ...f, address: data.address }))
      } else {
        setAddCustomerMsg({ type: 'error', text: '該当する住所が見つかりませんでした' })
      }
    } catch {
      setAddCustomerMsg({ type: 'error', text: '住所の検索に失敗しました' })
    }
    setZipLooking(false)
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  // マスタ（流入経路）・保存ビューを取得
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/lead-sources')
      .then(r => r.ok ? r.json() : [])
      .then(d => setLeadSources(Array.isArray(d) ? d : []))
      .catch(() => {})
    fetch('/api/list-views?portal=store')
      .then(r => r.ok ? r.json() : { views: [] })
      .then(d => setSavedViews((d.views || []).map((v: any) => ({
        id: v.id, name: v.name, filters: v.filters,
        columns: v.columns ? JSON.parse(v.columns) : null,
      }))))
      .catch(() => {})
  }, [status])

  // 表示列をlocalStorageから復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0) {
          setVisibleCols(arr.filter((k: string) => STORE_DEFAULT_COLS.includes(k)))
        }
      }
    } catch { /* ignore */ }
  }, [])

  function updateVisibleCols(cols: string[]) {
    setVisibleCols(cols)
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)) } catch { /* ignore */ }
  }

  // 一覧取得（フィルタ・ソート・ページが変わるたびに全担当顧客対象でサーバー側絞り込み。検索はデバウンス）
  useEffect(() => {
    if (status !== 'authenticated' || !ready) return
    const storeId = (session!.user as any).id
    const handle = setTimeout(() => {
      setSearching(true)
      fetch(`/api/stores/${storeId}/customers?page=${page}&limit=${CUSTOMERS_LIMIT}${filterQuery ? `&${filterQuery}` : ''}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.customers ?? (Array.isArray(data) ? data : [])
          setCustomers(list)
          setCustomersTotal(data?.total ?? list.length)
        })
        .catch(() => { /* ignore */ })
        .finally(() => { setLoading(false); setSearching(false) })
    }, params.search?.trim() ? 300 : 0)
    return () => clearTimeout(handle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, ready, filterQuery, page])

  // フィルタ・ページが変わったら行選択を解除
  useEffect(() => {
    setSelectedIds(new Set())
    setAllMatching(false)
  }, [filterQuery, page])

  async function refreshCustomers() {
    const storeId = (session?.user as any).id
    const listRes = await fetch(`/api/stores/${storeId}/customers?page=${page}&limit=${CUSTOMERS_LIMIT}${filterQuery ? `&${filterQuery}` : ''}`)
    const listData = await listRes.json()
    const list = listData?.customers ?? (Array.isArray(listData) ? listData : [])
    setCustomers(list)
    setCustomersTotal(listData?.total ?? list.length)
  }

  // ---- 保存ビュー ----
  const views: ListView[] = [...STORE_PRESET_VIEWS, ...savedViews]
  const activeViewId = views.find(
    v => serializeParams(parseFilterString(v.filters), FILTER_PARAM_KEYS) === filterQuery
  )?.id ?? null

  function handleSelectView(v: ListView) {
    replaceParams(parseFilterString(v.filters))
    if (v.columns && v.columns.length > 0) {
      updateVisibleCols(v.columns.filter(k => STORE_DEFAULT_COLS.includes(k)))
    }
  }

  async function handleSaveView(name: string) {
    const res = await fetch('/api/list-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'store', name, filters: filterQuery, columns: visibleCols }),
    })
    if (res.ok) {
      const v = await res.json()
      setSavedViews(prev => [...prev, { id: v.id, name: v.name, filters: v.filters, columns: visibleCols }])
    } else {
      const data = await res.json().catch(() => ({}))
      setBulkMsg({ type: 'error', text: data.error || 'ビューの保存に失敗しました' })
    }
  }

  async function handleDeleteView(v: ListView) {
    if (!confirm(`ビュー「${v.name}」を削除しますか？`)) return
    const res = await fetch(`/api/list-views/${v.id}`, { method: 'DELETE' })
    if (res.ok) setSavedViews(prev => prev.filter(x => x.id !== v.id))
  }

  // ---- サーバーサイドソート ----
  const [sortField, sortDirRaw] = (params.sort || '').split(':')
  const serverSort = sortField
    ? { key: sortField === 'furigana' ? 'name' : sortField, dir: (sortDirRaw === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' }
    : null

  function handleSortChange(colKey: string) {
    const field = SORT_FIELD_BY_COL[colKey]
    if (!field) return
    const nextDir = sortField === field && sortDirRaw !== 'desc' ? 'desc' : 'asc'
    setParams({ sort: `${field}:${nextDir}` })
  }

  // ---- 一括操作 ----
  const effectiveSelectedCount = allMatching ? customersTotal : selectedIds.size

  function handleBulkAction(key: string) {
    const storeId = (session?.user as any).id
    if (key === 'export') {
      const qs = allMatching || selectedIds.size === 0
        ? filterQuery
        : `ids=${encodeURIComponent([...selectedIds].join(','))}`
      window.location.href = `/api/stores/${storeId}/customers/export${qs ? `?${qs}` : ''}`
      return
    }
    if (key === 'setType') setBulkTypeModal(true)
  }

  async function submitBulkType() {
    const storeId = (session?.user as any).id
    const label = TYPE_OPTIONS.find(o => o.value === bulkType)?.label ?? bulkType
    setBulkBusy('setType')
    try {
      const res = await fetch(`/api/stores/${storeId}/customers/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setType',
          ...(allMatching ? { filters: filterQuery } : { ids: [...selectedIds] }),
          payload: { customerType: bulkType },
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setBulkMsg({ type: 'success', text: `${data.count}件の顧客タイプを「${label}」に変更しました` })
        setBulkTypeModal(false)
        setSelectedIds(new Set())
        setAllMatching(false)
        await refreshCustomers()
      } else {
        setBulkMsg({ type: 'error', text: data.error || '一括変更に失敗しました' })
      }
    } catch {
      setBulkMsg({ type: 'error', text: '一括変更に失敗しました' })
    }
    setBulkBusy(null)
  }

  function openAddWizard() {
    setShowAddCustomer(true)
    setWizardStep(1)
    setAddCustomerMsg(null)
    setAddCustomerForm({ lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', email: '', phone: '', postalCode: '', address: '', leadSource: '' })
    setCreatedCustomer(null)
    setDealForm({ detail: '', occurredAt: todayStr() })
    setCreatedDealId(null)
    setScheduleForm({ visitDate: '', startTime: '', endTime: '', note: '' })
  }

  // ステップ1: 顧客作成 → 案件作成へ
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName: addCustomerForm.lastName,
          firstName: addCustomerForm.firstName,
          lastNameKana: addCustomerForm.lastNameKana,
          firstNameKana: addCustomerForm.firstNameKana,
          email: addCustomerForm.email,
          phone: addCustomerForm.phone,
          address: addCustomerForm.address,
          leadSource: addCustomerForm.leadSource || undefined,
          // パスワードはAPIで自動生成
          customerType: 'regular',
          skipLicenseKey: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAddCustomerMsg({ type: 'error', text: data.error ?? '顧客の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      const created = await res.json()
      setCreatedCustomer({ id: created.id, name: created.name ?? `${addCustomerForm.lastName} ${addCustomerForm.firstName}`.trim() })
      await refreshCustomers() // 一覧に即時反映
      setWizardStep(2)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '顧客の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // ステップ2: 案件作成 → 訪問予定へ（スキップ可）
  async function handleCreateDeal() {
    if (!createdCustomer) return
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const storeId = (session?.user as any).id
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: createdCustomer.id, storeId, detail: dealForm.detail, occurredAt: dealForm.occurredAt || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAddCustomerMsg({ type: 'error', text: data.error ?? '案件の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      const created = await res.json()
      setCreatedDealId(created.id ?? null)
      setWizardStep(3)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '案件の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // ステップ3: 訪問予定追加 → 完了（スキップ可）
  async function handleCreateSchedule() {
    if (!createdCustomer || !scheduleForm.visitDate) return
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const storeId = (session?.user as any).id
      const res = await fetch('/api/visit-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: createdCustomer.id,
          storeId,
          dealId: createdDealId || undefined,
          visitDate: scheduleForm.visitDate,
          startTime: scheduleForm.startTime || undefined,
          endTime: scheduleForm.endTime || undefined,
          note: scheduleForm.note || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAddCustomerMsg({ type: 'error', text: data.error ?? '訪問予定の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      await refreshCustomers() // 次回訪問予定列を更新
      setWizardStep(4)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '訪問予定の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // 案件/予定をスキップして完了画面へ（予定スキップ時は一覧を最新化）
  async function skipToDone() {
    await refreshCustomers()
    setWizardStep(4)
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const customerColumns: Column<Customer>[] = [
    {
      key: 'name',
      header: '氏名',
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--md-sys-color-on-surface)]">{c.name}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.furigana}</div>
        </div>
      ),
      sortable: true,
      sortValue: (c) => c.furigana,
    },
    {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (c) => (
        <div>
          <div className="text-[var(--md-sys-color-on-surface)]">{c.phone}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'address',
      header: '住所',
      hideOnMobile: true,
      render: (c) => (
        <div className="text-[var(--md-sys-color-on-surface-variant)] max-w-48 truncate">{c.address}</div>
      ),
    },
    {
      key: 'customerType',
      header: 'タイプ',
      hideOnMobile: true,
      render: (c) => {
        const typeMap: Record<string, { label: string; cls: string }> = {
          delivery: { label: '宅配型', cls: 'bg-blue-100 text-blue-700' },
          regular:  { label: '通常買取', cls: 'bg-purple-100 text-purple-700' },
          visit:    { label: '訪問型', cls: 'bg-green-100 text-green-700' },
        }
        const t = typeMap[c.customerType] ?? typeMap.visit
        return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${t.cls}`}>{t.label}</span>
      },
    },
    {
      key: 'createdAt',
      header: '登録日',
      hideOnMobile: true,
      render: (c) => <span className="text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDate(c.createdAt)}</span>,
      sortable: true,
      sortValue: (c) => c.createdAt ?? '',
    },
    {
      key: 'lastVisit',
      header: '最終訪問日',
      hideOnMobile: true,
      render: (c) => <span className="text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDate(c.lastVisitDate)}</span>,
    },
    {
      key: 'nextVisit',
      header: '次回訪問予定',
      hideOnMobile: true,
      render: (c) => (
        <span className="text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
          {c.nextVisit
            ? `${fmtDate(c.nextVisit.visitDate)}${c.nextVisit.startTime ? ` ${c.nextVisit.startTime}` : ''}`
            : '—'}
        </span>
      ),
    },
  ]

  // 「列を編集」の設定を反映（氏名は常に先頭固定）
  const displayedColumns = [
    customerColumns[0],
    ...visibleCols
      .map(k => customerColumns.find(c => c.key === k))
      .filter(Boolean) as Column<Customer>[],
  ]

  return (
    <>
      <AppBar
        title="担当顧客"
        subtitle={filterQuery ? `${customersTotal}名 該当` : `${customersTotal}名`}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {bulkMsg && (
          <MessageBanner severity={bulkMsg.type} className="mb-4" dismissible onDismiss={() => setBulkMsg(null)}>
            {bulkMsg.text}
          </MessageBanner>
        )}

        {/* 保存ビュータブ */}
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
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={params.search || ''}
              onChange={e => setParams({ search: e.target.value })}
              placeholder="氏名・メール・電話で検索..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <ColumnPicker options={STORE_COLUMN_OPTIONS} visible={visibleCols} onChange={updateVisibleCols} />
            <Button
              variant="outlined"
              onClick={() => handleBulkAction('export')}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 7.5m0 0l4.5 4.5M12 7.5V21" />
                </svg>
                CSVエクスポート
              </span>
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push('/store/customers/import')}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                CSVインポート
              </span>
            </Button>
            <Button
              variant="filled"
              onClick={openAddWizard}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
                新規顧客追加
              </span>
            </Button>
          </div>
        </div>

        {/* クイックフィルタチップ */}
        <div className="mb-4">
          <FilterChipBar
            chips={storeChips(leadSources)}
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
          {params.search?.trim() && (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1.5 px-1">
              {searching ? '全顧客から検索中...' : `「${params.search.trim()}」に該当: ${customersTotal}名`}
            </p>
          )}
        </div>

        {/* 一括操作バー */}
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={customersTotal}
          allMatching={allMatching}
          onSelectAllMatching={() => setAllMatching(true)}
          onClearSelection={() => { setSelectedIds(new Set()); setAllMatching(false) }}
          actions={[
            { key: 'setType', label: 'タイプ変更' },
            { key: 'export', label: 'CSVエクスポート' },
          ]}
          onAction={handleBulkAction}
          busyAction={bulkBusy}
        />

        <Card variant="outlined" padding="none">
          <DataTable
            columns={displayedColumns}
            data={customers}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/store/customers/${c.id}`)}
            emptyTitle={filterQuery ? '検索結果がありません' : '担当顧客がいません'}
            selectable
            selectedKeys={allMatching ? new Set(customers.map(c => c.id)) : selectedIds}
            onSelectionChange={(keys) => { setSelectedIds(keys); setAllMatching(false) }}
            serverSort={serverSort}
            onSortChange={handleSortChange}
          />
        </Card>

        <PageNav page={page} pageCount={pageCount} onChange={(p) => setParams({ page: String(p) })} />
      </div>

      {/* 詳細フィルター */}
      <AdvancedFilterPanel
        open={advOpen}
        onClose={() => setAdvOpen(false)}
        fields={storeAdvFields(leadSources)}
        values={params}
        onApply={(patch) => setParams(patch)}
        fetchCount={async (draft) => {
          const storeId = (session?.user as any).id
          const qs = serializeParams({ ...params, ...draft }, FILTER_PARAM_KEYS)
          const res = await fetch(`/api/stores/${storeId}/customers?page=1&limit=1${qs ? `&${qs}` : ''}`)
          const data = await res.json()
          return data?.total ?? 0
        }}
      />

      {/* 一括タイプ変更モーダル */}
      <Modal open={bulkTypeModal} onClose={() => setBulkTypeModal(false)} title="顧客タイプを一括変更" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            選択中の{effectiveSelectedCount.toLocaleString()}件の主タイプを変更します。
          </p>
          <select
            value={bulkType}
            onChange={e => setBulkType(e.target.value)}
            className="w-full h-11 px-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="flex gap-3">
            <Button variant="text" onClick={() => setBulkTypeModal(false)} disabled={bulkBusy === 'setType'}>
              キャンセル
            </Button>
            <Button variant="filled" onClick={submitBulkType} loading={bulkBusy === 'setType'} disabled={bulkBusy === 'setType'} fullWidth>
              変更する
            </Button>
          </div>
        </div>
      </Modal>

      {/* 新規顧客追加ウィザード（顧客 → 案件 → 訪問予定） */}
      <Modal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        size={wizardStep === 3 ? 'lg' : 'md'}
        title={
          wizardStep === 1 ? '新規顧客追加'
          : wizardStep === 2 ? '案件を作成（任意）'
          : wizardStep === 3 ? '訪問予定を追加（任意）'
          : '登録完了'
        }
        disableBackdropClose
      >
        {/* ステッパー */}
        {wizardStep < 4 && (
          <div className="flex items-center justify-center gap-2 mb-4 text-xs">
            {([['1', '顧客'], ['2', '案件'], ['3', '予定']] as const).map(([n, label], i) => {
              const stepNo = i + 1
              const activeOrDone = wizardStep >= stepNo
              return (
                <div key={n} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${activeOrDone ? 'bg-[var(--portal-primary)] text-white' : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'}`}>{n}</span>
                  <span className={activeOrDone ? 'text-[var(--md-sys-color-on-surface)] font-medium' : 'text-[var(--md-sys-color-on-surface-variant)]'}>{label}</span>
                  {i < 2 && <span className="w-5 h-px bg-[var(--md-sys-color-outline-variant)]" />}
                </div>
              )
            })}
          </div>
        )}

        {addCustomerMsg && (
          <div className="mb-4">
            <MessageBanner severity={addCustomerMsg.type} dismissible onDismiss={() => setAddCustomerMsg(null)}>
              {addCustomerMsg.text}
            </MessageBanner>
          </div>
        )}

        {/* ステップ1: 顧客情報 */}
        {wizardStep === 1 && (
          <form onSubmit={handleCreateCustomer} className="space-y-4" autoComplete="off">
            <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <input type="password" name="prevent-autofill-pw" autoComplete="new-password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="姓" value={addCustomerForm.lastName} onChange={v => setAddCustomerForm(f => ({ ...f, lastName: v }))} required placeholder="山田" autoComplete="off" name="kk-cust-last-name" />
              <TextField label="名（任意）" value={addCustomerForm.firstName} onChange={v => setAddCustomerForm(f => ({ ...f, firstName: v }))} placeholder="太郎" autoComplete="off" name="kk-cust-first-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="せい（ふりがな）" value={addCustomerForm.lastNameKana} onChange={v => setAddCustomerForm(f => ({ ...f, lastNameKana: v }))} required placeholder="やまだ" autoComplete="off" name="kk-cust-last-kana" />
              <TextField label="めい（ふりがな・任意）" value={addCustomerForm.firstNameKana} onChange={v => setAddCustomerForm(f => ({ ...f, firstNameKana: v }))} placeholder="たろう" autoComplete="off" name="kk-cust-first-kana" />
            </div>
            <TextField label="メールアドレス（任意）" type="email" value={addCustomerForm.email} onChange={v => setAddCustomerForm(f => ({ ...f, email: v }))} placeholder="taro@example.com" autoComplete="off" name="kk-cust-email" />
            <TextField label="電話番号（任意）" type="tel" value={addCustomerForm.phone} onChange={v => setAddCustomerForm(f => ({ ...f, phone: v }))} placeholder="090-1234-5678" autoComplete="off" name="kk-cust-phone" />
            <div>
              <TextField
                label="郵便番号（任意）"
                type="text"
                value={addCustomerForm.postalCode}
                onChange={v => {
                  setAddCustomerForm(f => ({ ...f, postalCode: v }))
                  if (v.replace(/[-ー\s]/g, '').length === 7) lookupPostal(v)
                }}
                placeholder="1234567"
                autoComplete="off"
                name="kk-cust-zip"
              />
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {zipLooking ? '住所を検索中...' : '7桁を入力すると住所が自動入力されます'}
              </p>
            </div>
            <TextField label="住所（任意）" value={addCustomerForm.address} onChange={v => setAddCustomerForm(f => ({ ...f, address: v }))} placeholder="東京都渋谷区..." autoComplete="off" name="kk-cust-address" />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">流入経路（任意）</label>
              <select
                value={addCustomerForm.leadSource}
                onChange={e => setAddCustomerForm(f => ({ ...f, leadSource: e.target.value }))}
                className="w-full h-12 px-3 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              >
                <option value="">未設定</option>
                <option value="電話">電話</option>
                <option value="LINE">LINE</option>
                <option value="紹介">紹介</option>
                <option value="Webフォーム">Webフォーム</option>
                <option value="おいくら">おいくら</option>
                <option value="その他">その他</option>
              </select>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">※ お問い合わせフォーム経由のお客様は自動的に「Webフォーム」が設定されます。</p>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              ※ パスワードは自動生成されます。お客様には後でマイページからパスワード設定をご案内ください。
            </p>
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="filled" loading={addCustomerSubmitting} disabled={addCustomerSubmitting || !addCustomerForm.lastName || !addCustomerForm.lastNameKana} fullWidth>
                {addCustomerSubmitting ? '登録中...' : '次へ（顧客を登録）'}
              </Button>
            </div>
          </form>
        )}

        {/* ステップ2: 案件作成 */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-medium text-[var(--md-sys-color-on-surface)]">{createdCustomer?.name} 様</span> を登録しました。続けて案件を作成できます（不要な場合はスキップ）。
            </p>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">案件内容（買取内容など）</label>
              <textarea
                value={dealForm.detail}
                onChange={(e) => setDealForm(prev => ({ ...prev, detail: e.target.value }))}
                rows={4}
                placeholder="例: 古い切手コレクション、ブランドバッグ数点 など"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">案件発生日</label>
              <input
                type="date"
                value={dealForm.occurredAt}
                onChange={(e) => setDealForm(prev => ({ ...prev, occurredAt: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">既定は本日。実際に案件が発生した日を設定できます。</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="text" onClick={() => setWizardStep(3)} disabled={addCustomerSubmitting}>
                スキップ
              </Button>
              <Button variant="filled" onClick={handleCreateDeal} loading={addCustomerSubmitting} disabled={addCustomerSubmitting} fullWidth>
                案件を作成して次へ
              </Button>
            </div>
          </div>
        )}

        {/* ステップ3: 訪問予定追加 */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {createdDealId ? '案件を作成しました。' : ''}訪問予定を追加できます（不要な場合はスキップ）。他の予定の空き枠を確認しながら選べます。
            </p>
            <WeekSchedulePicker
              value={{ visitDate: scheduleForm.visitDate, startTime: scheduleForm.startTime }}
              onSelect={(visitDate, startTime) => setScheduleForm(f => ({ ...f, visitDate, startTime: startTime || f.startTime }))}
              bizStart={bizHours?.start}
              bizEnd={bizHours?.end}
            />
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">訪問日 <span className="text-[var(--md-sys-color-error,#B3261E)]">*</span></label>
              <input
                type="date"
                value={scheduleForm.visitDate}
                onChange={(e) => setScheduleForm(f => ({ ...f, visitDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">開始時間（任意）</label>
                <TimeSelect value={scheduleForm.startTime} onChange={v => setScheduleForm(f => ({ ...f, startTime: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">終了時間（任意）</label>
                <TimeSelect value={scheduleForm.endTime} onChange={v => setScheduleForm(f => ({ ...f, endTime: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">メモ（任意）</label>
              <textarea value={scheduleForm.note} onChange={(e) => setScheduleForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="訪問に関するメモ" className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="text" onClick={skipToDone} disabled={addCustomerSubmitting}>
                スキップして完了
              </Button>
              <Button variant="filled" onClick={handleCreateSchedule} loading={addCustomerSubmitting} disabled={addCustomerSubmitting || !scheduleForm.visitDate} fullWidth>
                訪問予定を登録して完了
              </Button>
            </div>
          </div>
        )}

        {/* ステップ4: 完了 */}
        {wizardStep === 4 && (
          <div className="space-y-5 text-center py-2">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="font-semibold text-[var(--md-sys-color-on-surface)]">{createdCustomer?.name} 様 を登録しました</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {createdDealId ? '案件' : ''}{createdDealId ? '・' : ''}必要に応じて訪問予定も登録されました。
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="tonal" onClick={() => setShowAddCustomer(false)} fullWidth>
                閉じる
              </Button>
              {createdCustomer && (
                <Button variant="filled" onClick={() => router.push(`/store/customers/${createdCustomer.id}`)} fullWidth>
                  顧客ページを開く
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
