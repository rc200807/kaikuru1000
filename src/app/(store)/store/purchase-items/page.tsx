'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import InventoryFormModal, { purchaseItemToForm } from '@/components/store/InventoryFormModal'
import { useToast } from '@/components/Toast'

type Item = {
  id: string
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
  janCode: string | null
  createdAt: string
  images: string[]
  visitSchedule: {
    id: string
    visitDate: string
    status: string
    user: { id: string; name: string } | null
  } | null
  convertedInventoryId: string | null
}

const fmtYen = (n: number) => `¥${(n ?? 0).toLocaleString()}`

export default function StorePurchaseItemsPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const { success } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [convertItem, setConvertItem] = useState<Item | null>(null)

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
      const res = await fetch('/api/store/purchase-items?limit=500')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // 取得した品目からカテゴリ候補を抽出
  const categories = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => { if (i.category) set.add(i.category) })
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [items])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return items.filter(i => {
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false
      if (q) {
        const hay = [i.itemName, i.category, i.janCode ?? '', i.visitSchedule?.user?.name ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, searchText, categoryFilter])

  // 表示中の合計件数・合計買取額
  const totalAmount = useMemo(
    () => filtered.reduce((sum, i) => sum + (i.purchasePrice || 0) * (i.quantity || 0), 0),
    [filtered],
  )

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar title="買取品目一覧" />

      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {/* サマリー */}
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{filtered.length}<span className="text-base font-semibold">件</span></div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">表示中の品目数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{fmtYen(totalAmount)}</div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">合計買取額（数量×単価）</div>
          </div>
        </div>

        {/* 検索 + カテゴリ絞り込み */}
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
              placeholder="検索（品名/カテゴリ/JAN/顧客名）"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[{ value: 'all', label: 'すべて' }, ...categories.map(c => ({ value: c, label: c }))].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCategoryFilter(opt.value)}
                  className={`
                    px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0
                    ${categoryFilter === opt.value
                      ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                      : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* リスト */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {searchText || categoryFilter !== 'all' ? '該当する買取品目がありません' : '買取品目はまだありません'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(item => (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 flex gap-3"
              >
                {/* サムネイル */}
                <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[var(--md-sys-color-surface-container)] flex items-center justify-center">
                  {item.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.images[0]} alt={item.itemName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl opacity-30">📦</span>
                  )}
                </div>

                {/* 本体 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{item.itemName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {item.category && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                            {item.category}
                          </span>
                        )}
                        {item.janCode && (
                          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">JAN: {item.janCode}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{fmtYen(item.purchasePrice * item.quantity)}</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{item.quantity}点 × {fmtYen(item.purchasePrice)}</div>
                    </div>
                  </div>

                  {/* メタ情報 */}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex-wrap">
                    {item.visitSchedule?.user && (
                      <button
                        onClick={() => item.visitSchedule?.user && router.push(`/store/customers/${item.visitSchedule.user.id}`)}
                        className="text-[var(--store-primary)] hover:underline"
                      >
                        {item.visitSchedule.user.name}
                      </button>
                    )}
                    {item.visitSchedule && (
                      <button
                        onClick={() => item.visitSchedule && router.push(`/store/schedule/${item.visitSchedule.id}`)}
                        className="hover:underline"
                      >
                        訪問: {format(new Date(item.visitSchedule.visitDate), 'yyyy/M/d', { locale: ja })}
                      </button>
                    )}
                  </div>

                  {/* 在庫化 */}
                  <div className="mt-2 flex justify-end">
                    {item.convertedInventoryId ? (
                      <button
                        onClick={() => router.push('/store/inventory')}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors"
                      >
                        在庫化済み →
                      </button>
                    ) : (
                      <button
                        onClick={() => setConvertItem(item)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--store-primary)] text-[var(--store-on-primary)] hover:opacity-90 transition-opacity"
                      >
                        在庫化
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <InventoryFormModal
        open={!!convertItem}
        onClose={() => setConvertItem(null)}
        mode="convert"
        purchaseItemId={convertItem?.id}
        initial={convertItem ? purchaseItemToForm({
          itemName: convertItem.itemName,
          category: convertItem.category,
          purchasePrice: convertItem.purchasePrice,
          quantity: convertItem.quantity,
          janCode: convertItem.janCode,
          images: convertItem.images,
        }) : undefined}
        onSaved={() => { setConvertItem(null); fetchItems(); success('在庫化しました') }}
      />
    </div>
  )
}
