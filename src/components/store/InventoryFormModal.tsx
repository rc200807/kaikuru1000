'use client'

import { useState, useEffect } from 'react'
import BottomSheet from '@/components/BottomSheet'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import {
  INVENTORY_STATUSES, INVENTORY_STATUS_LABEL,
  INVENTORY_CONDITIONS, INVENTORY_CONDITION_LABEL,
  SHIPPING_PAYERS, SHIPPING_PAYER_LABEL,
  SHIPPING_DAYS, SHIPPING_DAYS_LABEL,
  type InventoryStatus, type InventoryCondition, type ShippingPayer,
} from '@/lib/inventory-status'

export type InventoryFormValues = {
  title: string
  description: string
  categoryName: string
  brand: string
  condition: InventoryCondition
  costPrice: string
  listingPrice: string
  quantity: string
  managementCode: string
  janCode: string
  weightGrams: string
  sizeW: string
  sizeH: string
  sizeD: string
  shippingPayer: ShippingPayer
  shippingMethod: string
  shippingFromPrefecture: string
  shippingDays: string
  status: InventoryStatus
  note: string
  imageUrls: string[]
}

function defaultForm(): InventoryFormValues {
  return {
    title: '', description: '', categoryName: '', brand: '',
    condition: 'no_noticeable_damage', costPrice: '', listingPrice: '', quantity: '1',
    managementCode: '', janCode: '', weightGrams: '', sizeW: '', sizeH: '', sizeD: '',
    shippingPayer: 'seller', shippingMethod: '', shippingFromPrefecture: '', shippingDays: '',
    status: 'draft', note: '', imageUrls: [],
  }
}

/** 在庫アイテム（API レスポンス）→ フォーム値 */
export function inventoryItemToForm(it: any): Partial<InventoryFormValues> {
  const s = (v: any) => (v != null ? String(v) : '')
  return {
    title: it.title ?? '', description: it.description ?? '', categoryName: it.categoryName ?? '',
    brand: it.brand ?? '', condition: it.condition ?? 'no_noticeable_damage',
    costPrice: s(it.costPrice), listingPrice: s(it.listingPrice), quantity: s(it.quantity) || '1',
    managementCode: it.managementCode ?? '', janCode: it.janCode ?? '',
    weightGrams: s(it.weightGrams), sizeW: s(it.sizeW), sizeH: s(it.sizeH), sizeD: s(it.sizeD),
    shippingPayer: it.shippingPayer === 'buyer' ? 'buyer' : 'seller',
    shippingMethod: it.shippingMethod ?? '', shippingFromPrefecture: it.shippingFromPrefecture ?? '',
    shippingDays: it.shippingDays ?? '', status: it.status ?? 'draft', note: it.note ?? '',
    imageUrls: Array.isArray(it.images) ? it.images : (Array.isArray(it.imageUrls) ? it.imageUrls : []),
  }
}

/** 買取品目 → フォーム値（変換時のプレフィル。imageUrls は表示用プロキシURL） */
export function purchaseItemToForm(pi: {
  itemName?: string; category?: string; purchasePrice?: number; quantity?: number; janCode?: string | null; images?: string[]
}): Partial<InventoryFormValues> {
  return {
    title: pi.itemName ?? '',
    categoryName: pi.category ?? '',
    costPrice: pi.purchasePrice != null ? String(pi.purchasePrice) : '',
    quantity: pi.quantity != null ? String(pi.quantity) : '1',
    janCode: pi.janCode ?? '',
    imageUrls: Array.isArray(pi.images) ? pi.images : [],
    condition: 'no_noticeable_damage',
    status: 'draft',
  }
}

type Mode = 'create' | 'edit' | 'convert'

type Props = {
  open: boolean
  onClose: () => void
  mode: Mode
  itemId?: string
  purchaseItemId?: string
  initial?: Partial<InventoryFormValues>
  onSaved: (item: any) => void
}

const MODAL_TITLE: Record<Mode, string> = {
  create: '在庫を追加',
  edit: '在庫を編集',
  convert: '買取品目を在庫化',
}

const selectCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--store-primary)]'

export default function InventoryFormModal({ open, onClose, mode, itemId, purchaseItemId, initial, onSaved }: Props) {
  const [form, setForm] = useState<InventoryFormValues>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showShipping, setShowShipping] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ ...defaultForm(), ...(initial || {}) })
      setError('')
      setShowShipping(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const isConvert = mode === 'convert'
  const set = <K extends keyof InventoryFormValues>(k: K, v: InventoryFormValues[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const remaining = 10 - form.imageUrls.length
    if (remaining <= 0) {
      setError('画像は最大10枚までです')
      return
    }
    setUploading(true)
    const newUrls = [...form.imageUrls]
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      try {
        const converted = await convertToJpegIfNeeded(files[i])
        const fd = new FormData()
        fd.append('file', converted)
        const res = await fetch('/api/store/inventory/images', { method: 'POST', body: fd })
        if (res.ok) {
          const { url } = await res.json()
          newUrls.push(url)
        }
      } catch {
        /* ignore individual failures */
      }
    }
    setForm(f => ({ ...f, imageUrls: newUrls }))
    setUploading(false)
    e.target.value = ''
  }

  function removeImage(idx: number) {
    setForm(f => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError('商品名は必須です')
      return
    }
    const cost = Number(form.costPrice)
    if (form.costPrice.trim() === '' || !Number.isFinite(cost) || cost < 0) {
      setError('仕入れ値を正しく入力してください')
      return
    }
    setSaving(true)
    setError('')

    const payload: any = {
      title: form.title.trim(),
      description: form.description,
      categoryName: form.categoryName,
      brand: form.brand,
      condition: form.condition,
      costPrice: form.costPrice,
      listingPrice: form.listingPrice,
      quantity: form.quantity.trim() === '' ? 1 : Number(form.quantity),
      managementCode: form.managementCode,
      janCode: form.janCode,
      weightGrams: form.weightGrams,
      sizeW: form.sizeW,
      sizeH: form.sizeH,
      sizeD: form.sizeD,
      shippingPayer: form.shippingPayer,
      shippingMethod: form.shippingMethod,
      shippingFromPrefecture: form.shippingFromPrefecture,
      shippingDays: form.shippingDays,
      status: form.status,
      note: form.note,
    }
    // 変換時は画像を送らない（サーバ側で買取品目の元Blob URLをコピーする）
    if (!isConvert) payload.imageUrls = form.imageUrls

    let res: Response
    try {
      if (mode === 'edit' && itemId) {
        res = await fetch(`/api/store/inventory/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else if (mode === 'convert' && purchaseItemId) {
        res = await fetch('/api/store/inventory/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseItemId, overrides: payload }),
        })
      } else {
        res = await fetch('/api/store/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
    } catch {
      setSaving(false)
      setError('通信に失敗しました')
      return
    }
    setSaving(false)
    if (res.ok) {
      const item = await res.json()
      onSaved(item)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || '保存に失敗しました')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={MODAL_TITLE[mode]} desktopMaxWidth="sm:max-w-2xl">
      <div className="space-y-4">
        {error && <MessageBanner severity="error">{error}</MessageBanner>}

        {/* 画像 */}
        <div>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">商品画像</label>
          {isConvert ? (
            <div>
              <div className="flex gap-2 flex-wrap">
                {form.imageUrls.map((url, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" key={idx} src={url} alt="" className="w-16 h-16 object-cover rounded border border-[var(--md-sys-color-outline-variant)]" />
                ))}
                {form.imageUrls.length === 0 && (
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">画像なし</span>
                )}
              </div>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">買取品目の画像（{form.imageUrls.length}枚）を引き継ぎます。追加・削除は在庫化後に編集できます。</p>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {form.imageUrls.map((url, idx) => (
                <div key={idx} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async" src={url} alt="" className="w-16 h-16 object-cover rounded border border-[var(--md-sys-color-outline-variant)]" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              {form.imageUrls.length < 10 && (
                <label className="w-16 h-16 rounded border-2 border-dashed border-[var(--md-sys-color-outline-variant)] flex items-center justify-center cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                  {uploading ? (
                    <div className="w-5 h-5 border-2 border-[var(--store-primary)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-2xl text-[var(--md-sys-color-on-surface-variant)] leading-none">＋</span>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* 基本情報 */}
        <TextField label="商品名" value={form.title} onChange={v => set('title', v)} required />
        <TextField label="商品説明" value={form.description} onChange={v => set('description', v)} rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="カテゴリ" value={form.categoryName} onChange={v => set('categoryName', v)} />
          <TextField label="ブランド" value={form.brand} onChange={v => set('brand', v)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">商品の状態</label>
          <select value={form.condition} onChange={e => set('condition', e.target.value as InventoryCondition)} className={selectCls}>
            {INVENTORY_CONDITIONS.map(c => <option key={c} value={c}>{INVENTORY_CONDITION_LABEL[c]}</option>)}
          </select>
        </div>

        {/* 価格・数量 */}
        <div className="grid grid-cols-3 gap-3">
          <TextField label="仕入れ値(円)" type="number" value={form.costPrice} onChange={v => set('costPrice', v)} required />
          <TextField label="販売価格(円)" type="number" value={form.listingPrice} onChange={v => set('listingPrice', v)} />
          <TextField label="数量" type="number" value={form.quantity} onChange={v => set('quantity', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="管理コード/SKU" value={form.managementCode} onChange={v => set('managementCode', v)} />
          <TextField label="JANコード" value={form.janCode} onChange={v => set('janCode', v)} />
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">ステータス</label>
          <select value={form.status} onChange={e => set('status', e.target.value as InventoryStatus)} className={selectCls}>
            {INVENTORY_STATUSES.map(s => <option key={s} value={s}>{INVENTORY_STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        {/* 出品情報（配送・サイズ）折りたたみ */}
        <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-3">
          <button
            type="button"
            onClick={() => setShowShipping(v => !v)}
            className="flex items-center gap-1 text-sm font-medium text-[var(--md-sys-color-on-surface)]"
          >
            <span>{showShipping ? '▼' : '▶'}</span> 出品情報（配送・サイズ）
          </button>
          {showShipping && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">送料負担</label>
                  <select value={form.shippingPayer} onChange={e => set('shippingPayer', e.target.value as ShippingPayer)} className={selectCls}>
                    {SHIPPING_PAYERS.map(p => <option key={p} value={p}>{SHIPPING_PAYER_LABEL[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">発送までの日数</label>
                  <select value={form.shippingDays} onChange={e => set('shippingDays', e.target.value)} className={selectCls}>
                    <option value="">未設定</option>
                    {SHIPPING_DAYS.map(d => <option key={d} value={d}>{SHIPPING_DAYS_LABEL[d]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="配送方法" value={form.shippingMethod} onChange={v => set('shippingMethod', v)} />
                <TextField label="発送元の地域" value={form.shippingFromPrefecture} onChange={v => set('shippingFromPrefecture', v)} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <TextField label="重量(g)" type="number" value={form.weightGrams} onChange={v => set('weightGrams', v)} />
                <TextField label="横(cm)" type="number" value={form.sizeW} onChange={v => set('sizeW', v)} />
                <TextField label="縦(cm)" type="number" value={form.sizeH} onChange={v => set('sizeH', v)} />
                <TextField label="高さ(cm)" type="number" value={form.sizeD} onChange={v => set('sizeD', v)} />
              </div>
            </div>
          )}
        </div>

        <TextField label="メモ（社内用）" value={form.note} onChange={v => set('note', v)} rows={2} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={saving || uploading}>
            {isConvert ? '在庫化する' : '保存'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
