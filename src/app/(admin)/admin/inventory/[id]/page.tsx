'use client'

import { useEffect, useState, use as usePromise } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
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

export default function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = role === 'superadmin' || role === 'admin'

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [name, setName] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [sellingPrice, setSellingPrice] = useState('0')
  const [stock, setStock] = useState('0')
  const [imageUrl, setImageUrl] = useState('')
  const [supplierUrl, setSupplierUrl] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [supplierNote, setSupplierNote] = useState('')

  // new variant form
  const [vSize, setVSize] = useState('')
  const [vStock, setVStock] = useState('0')
  const [vPrice, setVPrice] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  function load() {
    fetch(`/api/admin/inventory/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then((p: Product | null) => {
        if (p) {
          setProduct(p)
          setName(p.name)
          setPurchasePrice(String(p.purchasePrice))
          setSellingPrice(String(p.sellingPrice))
          setStock(String(p.stock))
          setImageUrl(p.imageUrl ?? '')
          setSupplierUrl(p.supplierUrl ?? '')
          setSupplierEmail(p.supplierEmail ?? '')
          setSupplierNote(p.supplierNote ?? '')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          purchasePrice: Number(purchasePrice),
          sellingPrice: Number(sellingPrice),
          stock: Number(stock),
          imageUrl: imageUrl || null,
          supplierUrl: supplierUrl || null,
          supplierEmail: supplierEmail || null,
          supplierNote: supplierNote || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash('error', j.error ?? '保存に失敗しました')
        return
      }
      flash('success', '保存しました')
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleAddVariant() {
    if (!vSize.trim()) return
    const res = await fetch(`/api/admin/inventory/${id}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sizeName: vSize.trim(),
        stock: Number(vStock || '0'),
        sellingPrice: vPrice ? Number(vPrice) : null,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash('error', j.error ?? '追加に失敗しました')
      return
    }
    setVSize(''); setVStock('0'); setVPrice('')
    load()
  }

  async function handleUpdateVariant(v: Variant, patch: Partial<Variant>) {
    await fetch(`/api/admin/inventory/${id}/variants`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId: v.id, ...patch }),
    })
    load()
  }

  async function handleDeleteVariant(v: Variant) {
    if (!confirm(`サイズ「${v.sizeName}」を削除しますか？`)) return
    await fetch(`/api/admin/inventory/${id}/variants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId: v.id }),
    })
    load()
  }

  async function handleDelete() {
    if (!confirm('この商品を削除しますか？')) return
    const res = await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin/inventory')
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (!product) {
    return <div style={{ padding: 40, textAlign: 'center' }}>商品が見つかりません</div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <button onClick={() => router.push('/admin/inventory')} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← 一覧に戻る
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 16px' }}>{product.name}</h1>

      {msg && (
        <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: msg.kind === 'success' ? 'rgba(46, 125, 50, 0.15)' : 'rgba(211, 47, 47, 0.15)', color: msg.kind === 'success' ? '#66bb6a' : '#ef5350', fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      <section style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>基本情報</h2>
        <div style={{ marginBottom: 16 }}>
          <Field label="商品画像">
            <ProductImageUploader
              value={imageUrl}
              onChange={setImageUrl}
              onError={text => flash('error', text)}
              disabled={!canEdit}
            />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="商品名"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} disabled={!canEdit} /></Field>
          <Field label="在庫数（バリアントなし時）"><input type="number" value={stock} onChange={e => setStock(e.target.value)} style={inputStyle} disabled={!canEdit || product.hasVariants} /></Field>
          <Field label="仕入れ価格"><input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} style={inputStyle} disabled={!canEdit} /></Field>
          <Field label="販売価格"><input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} style={inputStyle} disabled={!canEdit} /></Field>
          <Field label="発注先URL"><input value={supplierUrl} onChange={e => setSupplierUrl(e.target.value)} style={inputStyle} disabled={!canEdit} /></Field>
          <Field label="発注先メール"><input type="email" value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} style={inputStyle} disabled={!canEdit} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="メモ"><textarea value={supplierNote} onChange={e => setSupplierNote(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={!canEdit} /></Field>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={handleDelete} style={{ ...primaryBtn, background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }}>削除</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? '保存中…' : '保存'}</button>
          </div>
        )}
      </section>

      <section style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>サイズバリアント</h2>
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
          サイズを 1 つ以上追加すると、各サイズ単位で在庫を管理します。基本の在庫数フィールドは無効化されます。
        </p>

        {product.variants.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>サイズバリアントは登録されていません</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 16 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                <th style={{ padding: '8px 4px', fontWeight: 600 }}>サイズ名</th>
                <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>在庫</th>
                <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>販売価格（任意）</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {product.variants.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <td style={{ padding: '6px 4px' }}>
                    <input
                      defaultValue={v.sizeName}
                      onBlur={e => e.target.value !== v.sizeName && handleUpdateVariant(v, { sizeName: e.target.value })}
                      style={inputStyle}
                      disabled={!canEdit}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <input
                      type="number"
                      defaultValue={v.stock}
                      onBlur={e => Number(e.target.value) !== v.stock && handleUpdateVariant(v, { stock: Number(e.target.value) })}
                      style={{ ...inputStyle, textAlign: 'right' }}
                      disabled={!canEdit}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <input
                      type="number"
                      defaultValue={v.sellingPrice ?? ''}
                      placeholder={String(product.sellingPrice)}
                      onBlur={e => {
                        const val = e.target.value === '' ? null : Number(e.target.value)
                        if (val !== v.sellingPrice) handleUpdateVariant(v, { sellingPrice: val })
                      }}
                      style={{ ...inputStyle, textAlign: 'right' }}
                      disabled={!canEdit}
                    />
                  </td>
                  {canEdit && (
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      <button onClick={() => handleDeleteVariant(v)} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-error)', cursor: 'pointer', fontSize: 13 }}>削除</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 160px' }}>
              <Field label="サイズ名"><input value={vSize} onChange={e => setVSize(e.target.value)} placeholder="S / M / 28cm など" style={inputStyle} /></Field>
            </div>
            <div style={{ flex: '1 1 80px' }}>
              <Field label="在庫"><input type="number" value={vStock} onChange={e => setVStock(e.target.value)} style={inputStyle} /></Field>
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <Field label="販売価格（任意）"><input type="number" value={vPrice} onChange={e => setVPrice(e.target.value)} style={inputStyle} /></Field>
            </div>
            <button onClick={handleAddVariant} style={primaryBtn}>サイズを追加</button>
          </div>
        )}
      </section>
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
