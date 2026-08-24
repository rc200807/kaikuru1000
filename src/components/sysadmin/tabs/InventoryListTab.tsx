'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import SupplierAccounts from '@/components/sysadmin/SupplierAccounts'
import ProductImageUploader from '@/components/admin/ProductImageUploader'

type Variant = {
  id: string
  sizeName: string
  stock: number
  sellingPrice: number | null
}

type Product = {
  id: string
  name: string
  purchasePrice: number
  sellingPrice: number
  stock: number
  hasVariants: boolean
  imageUrl: string | null
  supplierUrl: string | null
  supplierEmail: string | null
  supplierNote: string | null
  variants: Variant[]
  updatedAt: string
}

type FormState = {
  name: string
  purchasePrice: string
  sellingPrice: string
  stock: string
  minLot: string
  imageUrl: string
  supplierUrl: string
  supplierEmail: string
  supplierNote: string
}

const EMPTY: FormState = {
  name: '',
  purchasePrice: '',
  sellingPrice: '',
  stock: '0',
  minLot: '1',
  imageUrl: '',
  supplierUrl: '',
  supplierEmail: '',
  supplierNote: '',
}

export default function InventoryListTab() {
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function refresh() {
    fetch('/api/sysadmin/inventory')
      .then(r => (r.ok ? r.json() : []))
      .then(setProducts)
  }

  useEffect(() => {
    fetch('/api/sysadmin/inventory')
      .then(r => (r.ok ? r.json() : []))
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [])

  function persistOrder(ordered: Product[]) {
    fetch('/api/sysadmin/inventory/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map(p => p.id) }),
    }).catch(() => {})
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return }
    setProducts(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      persistOrder(next)
      return next
    })
    setDragIndex(null)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(p =>
      [p.name, p.supplierEmail ?? '', p.supplierUrl ?? ''].join(' ').toLowerCase().includes(q)
    )
  }, [products, search])

  async function handleCreate() {
    setError('')
    if (!form.name.trim()) {
      setError('商品名は必須です')
      return
    }
    const purchasePrice = Number(form.purchasePrice)
    const sellingPrice = Number(form.sellingPrice)
    const stock = Number(form.stock || '0')
    const minLot = Math.max(1, Number(form.minLot || '1'))
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setError('仕入れ価格を正しく入力してください')
      return
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setError('販売価格を正しく入力してください')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/sysadmin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          purchasePrice,
          sellingPrice,
          stock,
          minLot,
          imageUrl: form.imageUrl.trim() || null,
          supplierUrl: form.supplierUrl.trim() || null,
          supplierEmail: form.supplierEmail.trim() || null,
          supplierNote: form.supplierNote.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? '登録に失敗しました')
        return
      }
      setModalOpen(false)
      setForm(EMPTY)
      refresh()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          備品の在庫・仕入れ価格・販売価格・発注先を管理（{filtered.length}件 / 全{products.length}件）
        </p>
        <button
          onClick={() => { setForm(EMPTY); setError(''); setModalOpen(true) }}
          style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + 新規追加
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="商品名・発注先で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 360, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)' }}
        />
      </div>

      {search.trim() === '' ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 8px' }}>
          ⠿ の行をドラッグして並べ替えると、管理ポータルの発注画面にもこの順序が反映されます。
        </p>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 8px' }}>
          ※ 並べ替えは検索を空にしたときに行えます。
        </p>
      )}
      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
              <th style={{ padding: '12px 8px', fontWeight: 600, width: 32 }}></th>
              <th style={{ padding: '12px 16px', fontWeight: 600, width: 64 }}></th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>商品名</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>仕入れ価格</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>販売価格</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>在庫</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>サイズ</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>発注先</th>
              <th style={{ padding: '12px 16px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
                  商品が登録されていません
                </td>
              </tr>
            )}
            {filtered.map((p, idx) => {
              const totalStock = p.hasVariants
                ? p.variants.reduce((s, v) => s + v.stock, 0)
                : p.stock
              const canReorder = search.trim() === ''
              return (
                <tr
                  key={p.id}
                  draggable={canReorder}
                  onDragStart={() => canReorder && setDragIndex(idx)}
                  onDragOver={e => { if (canReorder) e.preventDefault() }}
                  onDrop={() => canReorder && handleDrop(idx)}
                  style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', background: dragIndex === idx ? 'var(--md-sys-color-surface-container-high)' : 'transparent' }}
                >
                  <td style={{ padding: '8px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', cursor: canReorder ? 'grab' : 'default', userSelect: 'none' }}>
                    {canReorder ? '⠿' : ''}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    {p.imageUrl
                      ? <img loading="lazy" decoding="async" src={p.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)' }} />
                      : <div style={{ width: 48, height: 48, borderRadius: 6, background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }} />}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>¥{p.purchasePrice.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>¥{p.sellingPrice.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>{totalStock}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12 }}>
                    {p.hasVariants
                      ? p.variants.map(v => `${v.sizeName}(${v.stock})`).join(' / ')
                      : <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12 }}>
                    {p.supplierUrl && <div><a href={p.supplierUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-sys-color-primary)' }}>{p.supplierUrl}</a></div>}
                    {p.supplierEmail && <div>{p.supplierEmail}</div>}
                    {!p.supplierUrl && !p.supplierEmail && <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => router.push(`/sysadmin/inventory/${p.id}`)}
                      style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-primary)', border: '1px solid var(--md-sys-color-outline)', fontSize: 13, cursor: 'pointer' }}
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 発注先アカウント管理 */}
      <SupplierAccounts />

      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, color: 'var(--md-sys-color-on-surface)' }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>商品を追加</h2>
            {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="商品画像">
                <ProductImageUploader
                  value={form.imageUrl}
                  onChange={url => setForm({ ...form, imageUrl: url })}
                  onError={msg => setError(msg)}
                />
              </Field>
              <Field label="商品名 *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="仕入れ価格 *">
                  <input type="number" min={0} value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="販売価格 *">
                  <input type="number" min={0} value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="在庫数">
                  <input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Field label="最低ロット（最低発注数）">
                <input type="number" min={1} value={form.minLot} onChange={e => setForm({ ...form, minLot: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="発注先URL">
                <input value={form.supplierUrl} onChange={e => setForm({ ...form, supplierUrl: e.target.value })} style={inputStyle} placeholder="https://..." />
              </Field>
              <Field label="発注先メールアドレス">
                <input type="email" value={form.supplierEmail} onChange={e => setForm({ ...form, supplierEmail: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="メモ">
                <textarea value={form.supplierNote} onChange={e => setForm({ ...form, supplierNote: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              </Field>
              <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
                ※ サイズバリアントは作成後の詳細ページで追加できます
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)} disabled={saving} style={cancelBtn}>キャンセル</button>
              <button onClick={handleCreate} disabled={saving} style={primaryBtn}>{saving ? '保存中…' : '登録'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  background: 'var(--md-sys-color-primary)',
  color: 'var(--md-sys-color-on-primary)',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const cancelBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--md-sys-color-on-surface)',
  border: '1px solid var(--md-sys-color-outline)',
  fontSize: 14,
  cursor: 'pointer',
}
