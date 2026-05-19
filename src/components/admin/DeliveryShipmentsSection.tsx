'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/Card'
import Button from '@/components/Button'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import MessageBanner from '@/components/MessageBanner'

const STATUS_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'registered', label: '登録済み' },
  { value: 'shipped', label: '発送済み' },
  { value: 'received', label: '査定中' },
  { value: 'appraised', label: '振込準備中' },
  { value: 'transferred', label: '振込完了' },
]

const STATUS_LABEL: Record<string, string> = {
  registered: '登録済み',
  shipped: '発送済み',
  received: '査定中',
  appraised: '振込準備中',
  transferred: '振込完了',
}

const STATUS_STYLE: Record<string, string> = {
  registered: 'bg-orange-100 text-orange-700',
  shipped: 'bg-amber-100 text-amber-700',
  received: 'bg-blue-100 text-blue-700',
  appraised: 'bg-emerald-100 text-emerald-700',
  transferred: 'bg-emerald-100 text-emerald-700',
}

type Store = { id: string; name: string }

type ShipmentRecord = {
  id: string
  shipmentNumber: string
  shipmentMonth: string
  description: string | null
  imageUrls: string[]
  trackingImageUrls: string[]
  purchaseAmount: number | null
  status: string
  storeNote: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    furigana: string
    phone: string
    email: string | null
    store: { id: string; name: string } | null
  }
}

/** 宅配買取一覧セクション。/admin/eco-box のタブから利用される。 */
export default function DeliveryShipmentsSection() {
  const router = useRouter()

  const [records, setRecords] = useState<ShipmentRecord[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [shippedCount, setShippedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [inputQ, setInputQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [storeId, setStoreId] = useState('')

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => setStores(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filterStatus) params.set('status', filterStatus)
    if (storeId) params.set('storeId', storeId)

    try {
      const res = await fetch(`/api/admin/delivery-shipments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setShippedCount(data.shippedCount || 0)
      } else {
        setMsg({ type: 'error', text: 'データの取得に失敗しました' })
      }
    } catch {
      setMsg({ type: 'error', text: 'ネットワークエラーが発生しました' })
    }
    setLoading(false)
  }, [q, filterStatus, storeId])

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
    setFilterStatus('')
    setStoreId('')
  }

  return (
    <div>
      {msg && (
        <div className="mb-4">
          <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>
        </div>
      )}

      {shippedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-[var(--md-sys-shape-medium)] bg-amber-50 border border-amber-200 px-4 py-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-amber-800">
            <span className="font-bold">{shippedCount}件</span>の発送済み荷物が受取待ちです
          </p>
        </div>
      )}

      <Card variant="elevated" padding="md" className="mb-6">
        <form onSubmit={handleSearch}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                キーワード（送付番号・顧客名）
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inputQ}
                  onChange={e => setInputQ(e.target.value)}
                  placeholder="例: DS-2024 / 山田"
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
              <select
                value={storeId} onChange={e => setStoreId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                <option value="">すべての店舗</option>
                {stores.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
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

          <div className="flex gap-2">
            <Button type="submit" size="sm">検索</Button>
            <Button type="button" variant="text" size="sm" onClick={clearFilters}>クリア</Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : records.length === 0 ? (
        <Card variant="elevated" padding="none"><EmptyState title="該当する宅配買取がありません" /></Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{records.length}件の送付記録</p>
          {records.map(rec => (
            <Card
              key={rec.id} variant="elevated" padding="md"
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/admin/deliveries/${rec.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{rec.shipmentNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[rec.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[rec.status] || rec.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                    <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                      {rec.user.name}
                      {rec.user.furigana && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] ml-1">({rec.user.furigana})</span>}
                    </span>
                    {rec.user.store && (
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] px-2 py-0.5 rounded">
                        {rec.user.store.name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    <span>{rec.shipmentMonth}</span>
                    {rec.user.phone && <span>{rec.user.phone}</span>}
                    {rec.description && <span className="truncate max-w-48">{rec.description}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {rec.purchaseAmount != null ? (
                    <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">¥{rec.purchaseAmount.toLocaleString()}</p>
                  ) : (
                    <p className="text-xs text-[var(--md-sys-color-outline)]">未査定</p>
                  )}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    {new Date(rec.createdAt).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
