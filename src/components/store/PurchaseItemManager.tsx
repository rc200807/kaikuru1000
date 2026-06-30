'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import InventoryFormModal, { purchaseItemToForm } from '@/components/store/InventoryFormModal'
import { formatYen } from '@/lib/currency'

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false })

type RakutenProduct = { productName: string; brandName?: string; makerName?: string; genreName?: string; averagePrice?: number; mediumImageUrl?: string; reviewCount?: number; reviewAverage?: number }
type MarketResearch = { productDetail: string; estimatedCondition: string; maxPrice: string; minPrice: string; platforms: string; supplement: string }
export type ManagedPurchaseItem = {
  id: string
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
  imageUrls: string[]
  janCode: string | null
  rakutenData: RakutenProduct | null
  aiResearch: MarketResearch | null
  aiResearchedAt: string | null
  convertedInventoryId: string | null
}

/**
 * 買取品目の登録・編集・削除・AI査定・1000円ボックス・在庫化を行う共有マネージャ。
 * 案件詳細（parentType='deal'）と訪問詳細（parentType='visit'）で同じ機能を提供する。
 * 品目自体は親(案件/訪問)のGETから渡され、変更後は onChanged() で親を再取得する。
 */
export default function PurchaseItemManager({
  parentType,
  parentId,
  items,
  categories,
  editable,
  onChanged,
  onMessage,
}: {
  parentType: 'deal' | 'visit'
  parentId: string
  items: ManagedPurchaseItem[]
  categories: { id: string; name: string }[]
  editable: boolean
  onChanged: () => void
  onMessage?: (m: { type: 'success' | 'error'; text: string }) => void
}) {
  const router = useRouter()
  const createUrl = parentType === 'deal'
    ? `/api/deals/${parentId}/purchase-items`
    : `/api/visit-schedules/${parentId}/purchase-items`

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ itemName: '', category: '', quantity: 1, purchasePrice: '' as number | '', imageUrls: [] as string[], janCode: '', rakutenData: null as RakutenProduct | null })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [janLookupLoading, setJanLookupLoading] = useState(false)
  const [janLookupError, setJanLookupError] = useState<string | null>(null)

  const [researchingItemId, setResearchingItemId] = useState<string | null>(null)
  const [researchResults, setResearchResults] = useState<Record<string, MarketResearch>>({})
  const [researchErrors, setResearchErrors] = useState<Record<string, string>>({})
  const [expandedResearch, setExpandedResearch] = useState<Record<string, boolean>>({})

  const [convertItem, setConvertItem] = useState<ManagedPurchaseItem | null>(null)

  // 保存済みのAI査定結果を初期表示に反映
  useEffect(() => {
    const seed: Record<string, MarketResearch> = {}
    for (const it of items) if (it.aiResearch) seed[it.id] = it.aiResearch
    setResearchResults(prev => ({ ...seed, ...prev }))
  }, [items])

  const msg = (m: { type: 'success' | 'error'; text: string }) => onMessage?.(m)

  function resetForm() {
    setForm({ itemName: '', category: '', quantity: 1, purchasePrice: '', imageUrls: [], janCode: '', rakutenData: null })
    setEditingId(null)
    setShowForm(false)
    setJanLookupError(null)
  }

  function startEdit(item: ManagedPurchaseItem) {
    setForm({
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      imageUrls: item.imageUrls,
      janCode: item.janCode || '',
      rakutenData: item.rakutenData || null,
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  async function handleBarcodeDetected(code: string) {
    setShowScanner(false)
    setJanLookupLoading(true)
    setJanLookupError(null)
    setForm(prev => ({ ...prev, janCode: code }))
    try {
      const res = await fetch('/api/jan-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ janCode: code }),
      })
      if (res.ok) {
        const product: RakutenProduct = await res.json()
        setForm(prev => ({ ...prev, itemName: prev.itemName || product.productName, category: prev.category || product.genreName || '', janCode: code, rakutenData: product }))
        msg({ type: 'success', text: `商品を特定しました: ${product.productName}` })
      } else {
        const err = await res.json()
        setJanLookupError(err.error || '商品が見つかりませんでした')
      }
    } catch {
      setJanLookupError('商品検索に失敗しました')
    } finally {
      setJanLookupLoading(false)
    }
    if (!showForm) setShowForm(true)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const remaining = 3 - form.imageUrls.length
    if (remaining <= 0) { msg({ type: 'error', text: '画像は最大3枚までです' }); return }
    setUploading(true)
    const newUrls = [...form.imageUrls]
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const converted = await convertToJpegIfNeeded(files[i])
      const fd = new FormData()
      fd.append('file', converted)
      const res = await fetch('/api/purchase-items/images', { method: 'POST', body: fd })
      if (res.ok) { const { url } = await res.json(); newUrls.push(url) }
    }
    setForm({ ...form, imageUrls: newUrls })
    setUploading(false)
    e.target.value = ''
  }

  function removeImage(idx: number) {
    setForm({ ...form, imageUrls: form.imageUrls.filter((_, i) => i !== idx) })
  }

  async function savePurchaseItem() {
    if (!form.itemName || !form.category) { msg({ type: 'error', text: '品名とカテゴリーは必須です' }); return }
    setSaving(true)
    const payload = {
      itemName: form.itemName, category: form.category, quantity: form.quantity,
      purchasePrice: Number(form.purchasePrice) || 0, imageUrls: form.imageUrls,
      janCode: form.janCode || null, rakutenData: form.rakutenData || null,
    }
    try {
      if (editingId) {
        await fetch(`/api/purchase-items/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch(createUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      resetForm()
      onChanged()
      msg({ type: 'success', text: '買取品目を保存しました' })
    } catch {
      msg({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  async function addThousandYenBox() {
    setSaving(true)
    try {
      await fetch(createUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName: '1000円ボックス', category: '1000円ボックス', quantity: 1, purchasePrice: 1000, imageUrls: [] }),
      })
      onChanged()
      msg({ type: 'success', text: '1000円ボックスを追加しました' })
    } catch {
      msg({ type: 'error', text: '追加に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  async function deletePurchaseItem(id: string) {
    if (!confirm('この品目を削除しますか？')) return
    await fetch(`/api/purchase-items/${id}`, { method: 'DELETE' })
    onChanged()
    msg({ type: 'success', text: '品目を削除しました' })
  }

  async function handleAiResearch(itemId: string) {
    setResearchingItemId(itemId)
    setResearchErrors(prev => { const next = { ...prev }; delete next[itemId]; return next })
    try {
      const res = await fetch(`/api/purchase-items/${itemId}/ai-research`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setResearchErrors(prev => ({ ...prev, [itemId]: data.error || 'AI調査に失敗しました' }))
        return
      }
      const result: MarketResearch = await res.json()
      setResearchResults(prev => ({ ...prev, [itemId]: result }))
      setExpandedResearch(prev => ({ ...prev, [itemId]: true }))
    } catch {
      setResearchErrors(prev => ({ ...prev, [itemId]: 'AI調査に失敗しました。ネットワークエラーの可能性があります。' }))
    } finally {
      setResearchingItemId(null)
    }
  }

  function toggleResearch(itemId: string) {
    setExpandedResearch(prev => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  return (
    <div>
      {/* 操作バー */}
      {editable && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button size="sm" variant="outlined" onClick={() => { resetForm(); setShowForm(true) }}>＋ 品目を追加</Button>
          <Button size="sm" variant="outlined" onClick={() => setShowScanner(true)}>バーコード読取</Button>
          <button
            onClick={addThousandYenBox}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-red-600 text-white hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            1000円ボックスで買取
          </button>
        </div>
      )}

      {/* 品目リスト */}
      {items.length === 0 ? (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">買取品目はありません</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
              <div className="flex items-start gap-3 p-3">
                {item.imageUrls.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {item.imageUrls.map((url, i) => (
                      <div key={i} className="relative w-12 h-12 overflow-hidden rounded">
                        <img src={url} alt="" className={`w-full h-full object-cover border border-[var(--md-sys-color-outline-variant)] rounded ${researchingItemId === item.id ? 'animate-pulse' : ''}`} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{item.itemName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">{item.category}</span>
                    {item.janCode && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-mono">JAN: {item.janCode}</span>}
                  </div>
                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    数量: {item.quantity} × {formatYen(item.purchasePrice)} = <strong>{formatYen(item.purchasePrice * item.quantity)}</strong>
                  </div>
                  {item.rakutenData && (
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                      {item.rakutenData.makerName && <span>{item.rakutenData.makerName}</span>}
                      {item.rakutenData.averagePrice && <span> / 参考: ¥{item.rakutenData.averagePrice.toLocaleString()}</span>}
                    </div>
                  )}
                </div>
                {editable && (
                  <div className="flex gap-1 flex-shrink-0 items-start">
                    {item.category !== '1000円ボックス' && (
                      researchResults[item.id] ? (
                        <button onClick={() => toggleResearch(item.id)} className="text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300">
                          調査済
                          <svg className={`w-3 h-3 transition-transform ${expandedResearch[item.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      ) : (
                        <button onClick={() => handleAiResearch(item.id)} disabled={researchingItemId === item.id} className="text-xs px-2 py-1 rounded-full font-medium disabled:opacity-50 disabled:cursor-wait flex items-center gap-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600">
                          {researchingItemId === item.id ? (<><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />調査中...</>) : 'AI調査'}
                        </button>
                      )
                    )}
                    <button onClick={() => startEdit(item)} className="text-xs text-[var(--portal-primary)] hover:underline">編集</button>
                    {item.convertedInventoryId ? (
                      <button onClick={() => router.push('/store/inventory')} className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline">在庫化済み →</button>
                    ) : (
                      <button onClick={() => setConvertItem(item)} className="text-xs text-[var(--portal-primary)] font-medium hover:underline">在庫化</button>
                    )}
                  </div>
                )}
              </div>

              {/* AI査定結果 */}
              {researchResults[item.id] && expandedResearch[item.id] && (
                <div className="mx-3 mb-3 rounded-[var(--md-sys-shape-small,8px)] border border-purple-200 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300">AI 市場調査結果</span>
                    {item.aiResearchedAt && <span className="text-[10px] text-purple-500 dark:text-purple-400">({format(new Date(item.aiResearchedAt), 'M/d HH:mm', { locale: ja })} 調査)</span>}
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    {[
                      { label: '商品詳細', value: researchResults[item.id].productDetail },
                      { label: '想定コンディション', value: researchResults[item.id].estimatedCondition },
                      { label: '中古最高値', value: researchResults[item.id].maxPrice, highlight: true },
                      { label: '中古最安値', value: researchResults[item.id].minPrice },
                      { label: '取引プラットフォーム', value: researchResults[item.id].platforms },
                      { label: '補足情報', value: researchResults[item.id].supplement },
                    ].map((row) => (
                      <div key={row.label} className="flex gap-2">
                        <dt className="w-28 flex-shrink-0 font-medium text-purple-800 dark:text-purple-200">{row.label}</dt>
                        <dd className={`flex-1 break-all ${row.highlight ? 'font-bold text-purple-700 dark:text-purple-300' : 'text-[var(--md-sys-color-on-surface)]'}`}>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex justify-end mt-2">
                    <button onClick={() => handleAiResearch(item.id)} disabled={researchingItemId === item.id} className="text-[10px] px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 hover:bg-purple-200 disabled:opacity-50">再調査</button>
                  </div>
                </div>
              )}
              {researchErrors[item.id] && (
                <div className="mx-3 mb-3 p-2 rounded text-xs text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)]">{researchErrors[item.id]}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 追加・編集モーダル */}
      <Modal open={showForm} onClose={() => { if (!saving) resetForm() }} title={editingId ? '品目を編集' : '品目を追加'} size="lg">
        <div className="space-y-3">
          {form.janCode && (
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-blue-700 dark:text-blue-300">JAN: {form.janCode}</span>
                <button onClick={() => setForm({ ...form, janCode: '', rakutenData: null })} className="ml-auto text-xs text-blue-500 hover:underline">クリア</button>
              </div>
              {form.rakutenData && (
                <div className="mt-2 text-xs text-blue-800 dark:text-blue-200">
                  <div className="font-medium">{form.rakutenData.productName}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-blue-600 dark:text-blue-400">
                    {form.rakutenData.makerName && <span>メーカー: {form.rakutenData.makerName}</span>}
                    {form.rakutenData.brandName && <span>ブランド: {form.rakutenData.brandName}</span>}
                    {form.rakutenData.averagePrice && <span>参考価格: ¥{form.rakutenData.averagePrice.toLocaleString()}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
          {janLookupLoading && (
            <div className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />商品情報を検索中...
            </div>
          )}
          {janLookupError && (
            <div className="p-2 rounded text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">{janLookupError}（手動で品名を入力してください）</div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="text" onClick={() => setShowScanner(true)}>📷 バーコードを読み取る</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">品名 *</label>
              <input className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="例: ルイヴィトン バッグ" />
            </div>
            <div>
              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">カテゴリー *</label>
              <select className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">カテゴリーを選択</option>
                {categories.map((cat) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">数量</label>
              <input type="number" min={1} className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">買取金額（円）</label>
              <input type="number" min={0} className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">写真（最大3枚）</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {form.imageUrls.map((url, idx) => (
                <div key={idx} className="relative">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded border border-[var(--md-sys-color-outline-variant)]" />
                  <button onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white text-xs flex items-center justify-center">×</button>
                </div>
              ))}
              {form.imageUrls.length < 3 && (
                <label className="w-16 h-16 rounded border-2 border-dashed border-[var(--md-sys-color-outline-variant)] flex items-center justify-center cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                  {uploading ? <div className="w-5 h-5 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" /> : <svg className="w-6 h-6 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-between">
            {editingId ? (
              <button onClick={() => { deletePurchaseItem(editingId); resetForm() }} className="text-xs text-[var(--md-sys-color-error)] hover:underline">この品目を削除</button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="text" size="sm" onClick={resetForm}>キャンセル</Button>
              <Button size="sm" onClick={savePurchaseItem} disabled={saving} loading={saving}>{saving ? '保存中...' : '保存'}</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* バーコードスキャナ */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}

      {/* 在庫化 */}
      {convertItem && (
        <InventoryFormModal
          open={!!convertItem}
          onClose={() => setConvertItem(null)}
          mode="convert"
          purchaseItemId={convertItem.id}
          initial={purchaseItemToForm({
            itemName: convertItem.itemName, category: convertItem.category, purchasePrice: convertItem.purchasePrice,
            quantity: convertItem.quantity, janCode: convertItem.janCode, images: convertItem.imageUrls,
          })}
          onSaved={() => { setConvertItem(null); onChanged() }}
        />
      )}
    </div>
  )
}
