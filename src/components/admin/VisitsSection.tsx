'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
import SummaryCard from '@/components/SummaryCard'
import DataTable, { type Column } from '@/components/DataTable'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import { filterSelectableStatusOptions } from '@/lib/visit-status'

type VisitRecord = {
  id: string
  visitDate: string
  status: string
  note: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  user: { id: string; name: string; furigana: string; email: string; phone: string; address: string }
  store: { id: string; name: string; code: string }
}

type Store = { id: string; name: string; code: string }

const DEFAULT_STATUS_OPTIONS = [
  { value: '',            label: 'すべて' },
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

function fmt(n: number | null | undefined) {
  if (n == null) return <span className="text-[var(--md-sys-color-outline)]">—</span>
  return <span>¥{n.toLocaleString()}</span>
}

/** 訪問記録一覧セクション。/admin/visits と /admin/eco-box から利用される。 */
export default function VisitsSection({ customerTypes }: { customerTypes?: string[] }) {
  const router = useRouter()

  const [records, setRecords] = useState<VisitRecord[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [storeId, setStoreId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [inputQ, setInputQ] = useState('')

  const [visitStatuses, setVisitStatuses] = useState<{ key: string; label: string; color: string }[]>([])
  const STATUS_OPTIONS = visitStatuses.length > 0
    ? [{ value: '', label: 'すべて' }, ...filterSelectableStatusOptions(visitStatuses.map(s => ({ value: s.key, label: s.label })))]
    : DEFAULT_STATUS_OPTIONS

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenuId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  useEffect(() => {
    fetch('/api/visit-statuses')
      .then(res => res.ok ? res.json() : [])
      .then(data => setVisitStatuses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.ok ? r.json() : [])
      .then(data => setStores(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const customerTypesKey = customerTypes ? customerTypes.join(',') : ''

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)            params.set('q', q)
    if (storeId)      params.set('storeId', storeId)
    if (filterStatus) params.set('status', filterStatus)
    if (from)         params.set('from', from)
    if (to)           params.set('to', to)
    if (customerTypesKey) params.set('customerTypes', customerTypesKey)
    params.set('limit', '200')

    const res = await fetch(`/api/admin/visits?${params}`)
    if (res.ok) {
      const data = await res.json()
      setRecords(data.records || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }, [q, storeId, filterStatus, from, to, customerTypesKey])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setQ(inputQ)
  }

  function clearFilters() {
    setInputQ('')
    setQ('')
    setStoreId('')
    setFilterStatus('')
    setFrom('')
    setTo('')
  }

  const totalPurchase = records.reduce((s, r) => s + (r.purchaseAmount ?? 0), 0)
  const totalBilling  = records.reduce((s, r) => s + (r.billingAmount ?? 0), 0)
  const completedCount = records.filter(r => r.status === 'completed').length

  const visitColumns: Column<VisitRecord>[] = [
    {
      key: 'visitDate',
      header: '訪問日',
      render: (record) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
          {format(new Date(record.visitDate), 'yyyy/M/d（E）', { locale: ja })}
        </span>
      ),
      sortable: true,
      sortValue: (record) => record.visitDate,
    },
    {
      key: 'name',
      header: '顧客名',
      render: (record) => (
        <div>
          <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{record.user.name}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{record.user.furigana}</p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'メールアドレス',
      hideOnMobile: true,
      render: (record) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{record.user.email}</span>,
    },
    {
      key: 'phone',
      header: '電話番号',
      hideOnMobile: true,
      render: (record) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{record.user.phone}</span>,
    },
    {
      key: 'store',
      header: '担当店舗',
      render: (record) => (
        <div>
          <p className="text-sm text-[var(--md-sys-color-on-surface)]">{record.store.name}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{record.store.code}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'ステータス',
      render: (record) => <StatusBadge status={record.status as any} />,
    },
    {
      key: 'purchaseAmount',
      header: '買取金額',
      hideOnMobile: true,
      render: (record) => (
        <span className="text-sm text-right text-[var(--md-sys-color-on-surface)] whitespace-nowrap font-medium">
          {fmt(record.purchaseAmount)}
        </span>
      ),
      sortable: true,
      sortValue: (record) => record.purchaseAmount ?? 0,
    },
    {
      key: 'billingAmount',
      header: '請求金額',
      hideOnMobile: true,
      render: (record) => (
        <span className="text-sm text-right text-[var(--md-sys-color-on-surface)] whitespace-nowrap font-medium">
          {fmt(record.billingAmount)}
        </span>
      ),
      sortable: true,
      sortValue: (record) => record.billingAmount ?? 0,
    },
    {
      key: 'menu',
      header: '',
      width: '40px',
      render: (record) => (
        <div className="relative flex justify-end" ref={openMenuId === record.id ? menuRef : undefined}>
          <button
            className="p-1.5 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition-colors"
            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === record.id ? null : record.id) }}
            aria-label="メニューを開く"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {openMenuId === record.id && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-44 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-medium)] shadow-lg py-1 text-sm">
              <button
                className="w-full text-left px-4 py-2 hover:bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] transition-colors"
                onClick={e => { e.stopPropagation(); setOpenMenuId(null); router.push(`/admin/visits/${record.id}`) }}
              >
                詳細を見る
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] transition-colors"
                onClick={e => {
                  e.stopPropagation()
                  setOpenMenuId(null)
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(record.user.address)}&travelmode=driving`, '_blank')
                }}
              >
                ルートを検索
              </button>
              {record.note && (
                <div className="px-4 py-2 border-t border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {record.note}
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <Card variant="elevated" padding="md" className="mb-6">
        <form onSubmit={handleSearch}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">キーワード（顧客名・フリガナ・メール・電話）</label>
              <div className="relative">
                <input
                  type="text" value={inputQ} onChange={e => setInputQ(e.target.value)}
                  placeholder="例: 山田 / yamada@"
                  className="w-full h-10 pl-9 pr-10 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                {inputQ && (
                  <button type="button" onClick={() => { setInputQ(''); setQ('') }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">店舗</label>
              <StoreFilterSelect value={storeId} onChange={setStoreId} stores={stores} />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ステータス</label>
              <select
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                {STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">訪問日（開始）</label>
              <input
                type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">訪問日（終了）</label>
              <input
                type="date" value={to} onChange={e => setTo(e.target.value)}
                className="h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button type="submit" size="sm">検索</Button>
              <Button type="button" variant="text" size="sm" onClick={clearFilters}>クリア</Button>
            </div>
          </div>
        </form>
      </Card>

      {!loading && records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SummaryCard label="該当件数" value={total.toLocaleString()} unit="件" accentColor="bg-[#E8927C]" />
          <SummaryCard label={`買取金額合計（対応完了 ${completedCount}件）`} value={`¥${totalPurchase.toLocaleString()}`} accentColor="bg-[#E8927C]/70" />
          <SummaryCard label="請求金額合計（表示分）" value={`¥${totalBilling.toLocaleString()}`} accentColor="bg-[#E8927C]/50" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : records.length === 0 ? (
        <Card variant="elevated" padding="none"><EmptyState title="該当する訪問記録がありません" /></Card>
      ) : (
        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden">
          <DataTable<VisitRecord>
            columns={visitColumns}
            data={records}
            rowKey={(record) => record.id}
            onRowClick={(record) => router.push(`/admin/visits/${record.id}`)}
          />
          {total > records.length && (
            <div className="px-4 py-3 bg-[var(--md-sys-color-surface-container-low)] border-t border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] text-center">
              {total.toLocaleString()}件中 {records.length}件を表示しています
            </div>
          )}
        </div>
      )}
    </div>
  )
}
