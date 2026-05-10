'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

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
  supplierUrl: string
  supplierEmail: string
  supplierNote: string
}

const EMPTY: FormState = {
  name: '',
  purchasePrice: '',
  sellingPrice: '',
  stock: '0',
  supplierUrl: '',
  supplierEmail: '',
  supplierNote: '',
}

export default function InventoryListPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = role === 'superadmin' || role === 'admin'

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  function refresh() {
    fetch('/api/admin/inventory')
      .then(r => (r.ok ? r.json() : []))
      .then(setProducts)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/inventory')
      .then(r => (r.ok ? r.json() : []))
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [status])

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
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          purchasePrice,
          sellingPrice,
          stock,
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

  if (status === 'loading' || loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>備品管理</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            社内備品の在庫・仕入れ価格・販売価格・発注先を管理（{filtered.length}件 / 全{products.length}件）
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setForm(EMPTY); setError(''); setModalOpen(true) }}
            style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            + 新規追加
          </button>
        )}
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

      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
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
                <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
                  商品が登録されていません
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const totalStock = p.hasVariants
                ? p.variants.reduce((s, v) => s + v.stock, 0)
                : p.stock
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
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
                      onClick={() => router.push(`/admin/inventory/${p.id}`)}
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
