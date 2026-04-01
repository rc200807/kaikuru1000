'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
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

const STATUS_STYLE: Record<string, string> = {
  registered: 'bg-orange-100 text-orange-700',
  shipped: 'bg-amber-100 text-amber-700',
  received: 'bg-blue-100 text-blue-700',
  appraised: 'bg-emerald-100 text-emerald-700',
  transferred: 'bg-emerald-100 text-emerald-700',
}

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
  }
}

export default function StoreDeliveriesPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [records, setRecords] = useState<ShipmentRecord[]>([])
  const [shippedCount, setShippedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('q', search)

    const res = await fetch(`/api/store/delivery-shipments?${params}`)
    if (res.ok) {
      const data = await res.json()
      setRecords(data.records)
      setShippedCount(data.shippedCount)
    }
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  if (authStatus === 'loading') return <LoadingSpinner size="lg" className="min-h-screen flex items-center justify-center" />
  if (!session) { router.replace('/store/login'); return null }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <AppBar title="宅配買取管理" subtitle="発送された荷物の受取・査定・振込を管理します" />

      {msg && <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>}

      {/* Shipped notification banner */}
      {shippedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">{shippedCount}件の荷物が発送されました</p>
            <p className="text-xs text-amber-600">受取確認をしてください</p>
          </div>
          <Button size="sm" onClick={() => setStatusFilter('shipped')}>確認する</Button>
        </div>
      )}

      {/* Filters */}
      <Card variant="outlined" padding="md">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <TextField
              label="検索"
              value={searchInput}
              onChange={v => setSearchInput(v)}
              placeholder="顧客名または発送番号"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] block mb-1">ステータス</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2.5 bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)]"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={() => setSearch(searchInput)}>検索</Button>
          {(statusFilter || search) && (
            <Button size="sm" variant="tonal" onClick={() => { setStatusFilter(''); setSearch(''); setSearchInput('') }}>クリア</Button>
          )}
        </div>
      </Card>

      {/* Records list */}
      {loading ? (
        <div className="py-12"><LoadingSpinner size="md" label="読み込み中..." className="justify-center" /></div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          title="宅配送付がありません"
          description={statusFilter ? 'フィルターを変更してみてください' : '顧客が送付登録すると表示されます'}
        />
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <Card
              key={r.id}
              variant="outlined"
              padding="md"
              className="cursor-pointer hover:border-[var(--portal-primary)] transition-colors"
              onClick={() => router.push(`/store/deliveries/${r.id}`)}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="text-sm font-mono font-semibold text-[var(--md-sys-color-on-surface)]">{r.shipmentNumber}</p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{r.user.name}({r.user.furigana})</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.purchaseAmount !== null && (
                    <span className="text-sm font-bold text-emerald-700">&yen;{r.purchaseAmount.toLocaleString()}</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_OPTIONS.find(o => o.value === r.status)?.label || r.status}
                  </span>
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{r.shipmentMonth.replace('-', '年')}月</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
