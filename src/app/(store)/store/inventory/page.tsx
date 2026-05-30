'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import LoadingSpinner from '@/components/LoadingSpinner'
import InventoryFormModal, { inventoryItemToForm, type InventoryFormValues } from '@/components/store/InventoryFormModal'
import { useToast } from '@/components/Toast'
import {
  INVENTORY_STATUSES, INVENTORY_STATUS_LABEL, INVENTORY_STATUS_BADGE,
  INVENTORY_CONDITION_LABEL, type InventoryStatus, type InventoryCondition,
} from '@/lib/inventory-status'

type InventoryItem = {
  id: string
  title: string
  description: string
  categoryName: string
  brand: string | null
  condition: string
  costPrice: number
  listingPrice: number | null
  quantity: number
  managementCode: string | null
  janCode: string | null
  weightGrams: number | null
  sizeW: number | null
  sizeH: number | null
  sizeD: number | null
  shippingPayer: string
  shippingMethod: string | null
  shippingFromPrefecture: string | null
  shippingDays: string | null
  status: string
  note: string
  images: string[]
  listings?: { id: string; marketplace: string; listingStatus: string; url: string | null }[]
  createdAt: string
  updatedAt: string
}

const fmtYen = (n: number) => `¥${(n ?? 0).toLocaleString()}`

export default function StoreInventoryPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const { success } = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null) // null=新規

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus === 'authenticated') fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus])

  async function fetchItems() {
    setLoading(true)
    try {
      const res = await fetch('/api/store/inventory?limit=500')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return items.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (q) {
        const hay = [i.title, i.categoryName, i.brand ?? '', i.janCode ?? '', i.managementCode ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, searchText, statusFilter])

  const totalCost = useMemo(() => filtered.reduce((s, i) => s + (i.costPrice || 0) * (i.quantity || 0), 0), [filtered])
  const totalListing = useMemo(() => filtered.reduce((s, i) => s + (i.listingPrice || 0) * (i.quantity || 0), 0), [filtered])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(item: InventoryItem) {
    setEditing(item)
    setModalOpen(true)
  }
  function handleSaved() {
    success(editing ? '在庫を更新しました' : '在庫を登録しました')
    setModalOpen(false)
    setEditing(null)
    fetchItems()
  }

  const initial: Partial<InventoryFormValues> | undefined = editing ? inventoryItemToForm(editing) : undefined

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar title="在庫" />

      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {/* サマリー */}
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{filtered.length}<span className="text-base font-semibold">件</span></div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">表示中の在庫数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{fmtYen(totalCost)}</div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">合計仕入れ値</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{fmtYen(totalListing)}</div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">合計販売価格</div>
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={openCreate}>+ 在庫を追加</Button>
          </div>
        </div>

        {/* 検索 + ステータス絞り込み */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="検索（商品名/カテゴリ/ブランド/JAN/管理コード）"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[{ value: 'all', label: 'すべて' }, ...INVENTORY_STATUSES.map(s => ({ value: s, label: INVENTORY_STATUS_LABEL[s] }))].map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0
                  ${statusFilter === opt.value
                    ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* リスト */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {searchText || statusFilter !== 'all' ? '該当する在庫がありません' : '在庫はまだありません。「+ 在庫を追加」または買取品目から在庫化できます。'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item, i) => {
              const badge = INVENTORY_STATUS_BADGE[item.status as InventoryStatus] ?? INVENTORY_STATUS_BADGE.draft
              return (
                <button
                  key={item.id}
                  onClick={() => openEdit(item)}
                  className="text-left rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 flex gap-3 hover:bg-[var(--md-sys-color-surface-container)] transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[var(--md-sys-color-surface-container)] flex items-center justify-center">
                    {item.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-30">📦</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{item.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.fg }}>
                            {INVENTORY_STATUS_LABEL[item.status as InventoryStatus] ?? item.status}
                          </span>
                          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                            {INVENTORY_CONDITION_LABEL[item.condition as InventoryCondition] ?? item.condition}
                          </span>
                          {item.categoryName && (
                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{item.categoryName}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                          {item.listingPrice != null ? fmtYen(item.listingPrice) : '販売価格未設定'}
                        </div>
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">仕入 {fmtYen(item.costPrice)} ・ {item.quantity}点</div>
                      </div>
                    </div>
                    {item.listings && item.listings.length > 0 && (
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                        出品: {item.listings.map(l => l.marketplace).join(', ')}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <InventoryFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        mode={editing ? 'edit' : 'create'}
        itemId={editing?.id}
        initial={initial}
        onSaved={handleSaved}
      />
    </div>
  )
}
