'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import SupplyCheckout from '@/components/admin/SupplyCheckout'

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
  minLot: number
  hasVariants: boolean
  imageUrl: string | null
  variants: Variant[]
}

type OrderItem = {
  id: string
  productName: string
  sizeName: string | null
  unitPrice: number
  quantity: number
  subtotal: number
}

type SupplyOrder = {
  id: string
  orderNumber: string
  placedByName: string
  totalAmount: number
  status: string // pending | ordered
  paymentStatus: string // pending | paid | failed
  note: string | null
  items: OrderItem[]
  createdAt: string
}

type CheckoutInfo = {
  orderId: string
  orderNumber: string
  totalAmount: number
  clientSecret: string
  customerSessionClientSecret: string | null
}

const yen = (n: number) => `¥${n.toLocaleString()}`

export default function SupplyOrderPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tab, setTab] = useState<'order' | 'history'>('order')
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<SupplyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // cart: key=`${productId}:${variantId||'_'}` -> quantity
  const [cart, setCart] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')
  const [checkout, setCheckout] = useState<CheckoutInfo | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  function loadProducts() {
    return fetch('/api/admin/inventory')
      .then(r => (r.ok ? r.json() : []))
      .then(setProducts)
  }
  function loadOrders() {
    return fetch('/api/admin/supply-orders')
      .then(r => (r.ok ? r.json() : []))
      .then(setOrders)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    Promise.all([loadProducts(), loadOrders()]).finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(p => p.name.toLowerCase().includes(q))
  }, [products, search])

  // 価格解決：発注はサイズ問わず「仕入れ価格」で算出する
  function priceOf(p: Product, _v?: Variant) {
    return p.purchasePrice
  }
  function keyOf(productId: string, variantId?: string) {
    return `${productId}:${variantId ?? '_'}`
  }
  function setQty(key: string, qty: number) {
    setCart(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[key]
      else next[key] = qty
      return next
    })
  }

  // カート明細を算出
  const cartLines = useMemo(() => {
    const lines: { key: string; productId: string; variantId: string | null; label: string; unitPrice: number; quantity: number; subtotal: number }[] = []
    for (const [key, qty] of Object.entries(cart)) {
      const [productId, variantId] = key.split(':')
      const p = products.find(x => x.id === productId)
      if (!p) continue
      const v = variantId !== '_' ? p.variants.find(x => x.id === variantId) : undefined
      const unitPrice = priceOf(p, v)
      lines.push({
        key,
        productId,
        variantId: variantId === '_' ? null : variantId,
        label: v ? `${p.name}（${v.sizeName}）` : p.name,
        unitPrice,
        quantity: qty,
        subtotal: unitPrice * qty,
      })
    }
    return lines
  }, [cart, products])

  const cartTotal = cartLines.reduce((s, l) => s + l.subtotal, 0)

  async function handlePlaceOrder() {
    setError('')
    if (cartLines.length === 0) {
      setError('発注する商品を選択してください')
      return
    }
    if (cartTotal <= 0) {
      setError('合計金額が0円です。仕入れ価格が設定されている商品を選択してください')
      return
    }
    setPlacing(true)
    try {
      const res = await fetch('/api/admin/supply-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartLines.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          note: note.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error ?? '発注に失敗しました')
        return
      }
      setCheckout({
        orderId: j.orderId,
        orderNumber: j.orderNumber,
        totalAmount: j.totalAmount,
        clientSecret: j.clientSecret,
        customerSessionClientSecret: j.customerSessionClientSecret ?? null,
      })
    } finally {
      setPlacing(false)
    }
  }

  async function handlePaymentSuccess() {
    const ordered = checkout
    setCheckout(null)
    setCart({})
    setNote('')
    // 決済状態を同期 → 履歴を更新
    if (ordered) {
      await fetch(`/api/admin/supply-orders/${ordered.orderId}`).catch(() => {})
    }
    await loadOrders()
    setSuccessMsg(`発注が完了しました（${ordered?.orderNumber ?? ''}）`)
    setTab('history')
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>備品発注</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          備品を発注し、その場で決済できます。発注後のステータスは「発注履歴」で確認できます。
        </p>
      </div>

      {successMsg && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: 'rgba(46,125,50,0.15)', color: '#66bb6a', fontSize: 14 }}>
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <TabButton active={tab === 'order'} onClick={() => setTab('order')}>発注</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>発注履歴</TabButton>
      </div>

      {tab === 'order' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
          {/* カタログ */}
          <div>
            <input
              type="search"
              placeholder="商品名で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', maxWidth: 360, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', marginBottom: 16 }}
            />

            {filtered.length === 0 ? (
              <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40 }}>商品がありません</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {filtered.map(p => {
                  const inCart = p.hasVariants
                    ? p.variants.some(v => (cart[keyOf(p.id, v.id)] ?? 0) > 0)
                    : (cart[keyOf(p.id)] ?? 0) > 0
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'var(--md-sys-color-surface-container-low)',
                        borderRadius: 14,
                        border: inCart ? '2px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* 商品画像（大） */}
                      <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'var(--md-sys-color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--md-sys-color-on-surface-variant)" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                            </svg>
                          )}
                      </div>

                      {/* 本文 */}
                      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>{p.name}</div>

                        {!p.hasVariants ? (
                          <>
                            <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
                              仕入 {yen(p.purchasePrice)} ／ 在庫 {p.stock}
                              {p.minLot > 1 && <span style={{ marginLeft: 6, color: '#fbbf24' }}>／ 最低{p.minLot}個〜</span>}
                            </div>
                            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                              <QtyInput value={cart[keyOf(p.id)] ?? 0} onChange={q => setQty(keyOf(p.id), q)} min={p.minLot} />
                            </div>
                          </>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                            {p.variants.map(v => (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontSize: 12, minWidth: 0 }}>
                                  <span style={{ fontWeight: 600 }}>{v.sizeName}</span>
                                  <span style={{ color: 'var(--md-sys-color-on-surface-variant)', marginLeft: 6 }}>
                                    仕入{yen(p.purchasePrice)}／在庫{v.stock}
                                  </span>
                                </div>
                                <QtyInput value={cart[keyOf(p.id, v.id)] ?? 0} onChange={q => setQty(keyOf(p.id, v.id), q)} min={p.minLot} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* カート */}
          <div style={{ position: 'sticky', top: 16, background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16, border: '1px solid var(--md-sys-color-outline-variant)' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>発注内容</h2>
            {cartLines.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>商品を選択してください</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {cartLines.map(l => (
                  <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{l.label} × {l.quantity}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{yen(l.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
              <span>合計</span>
              <span>{yen(cartTotal)}</span>
            </div>

            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="備考（任意）"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, minHeight: 56 }}
            />

            {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

            <button
              onClick={handlePlaceOrder}
              disabled={placing || cartLines.length === 0}
              style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (placing || cartLines.length === 0) ? 0.6 : 1 }}
            >
              {placing ? '準備中…' : '発注して決済'}
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <OrderHistory orders={orders} />
      )}

      {/* 決済モーダル */}
      {checkout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, color: 'var(--md-sys-color-on-surface)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>お支払い</h2>
            <SupplyCheckout
              clientSecret={checkout.clientSecret}
              customerSessionClientSecret={checkout.customerSessionClientSecret}
              totalAmount={checkout.totalAmount}
              orderNumber={checkout.orderNumber}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setCheckout(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent',
        color: active ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

function QtyInput({ value, onChange, min = 1 }: { value: number; onChange: (q: number) => void; min?: number }) {
  // 正の数量は最低ロット(min)以上に制限。0は「カートから外す」を意味する。
  const dec = () => onChange(value <= min ? 0 : value - 1)
  const inc = () => onChange(value === 0 ? min : value + 1)
  const onType = (raw: number) => {
    const n = Math.max(0, Math.floor(raw || 0))
    onChange(n === 0 ? 0 : Math.max(min, n))
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={dec}
        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
      >−</button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onType(Number(e.target.value))}
        style={{ width: 48, textAlign: 'center', padding: '4px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 14 }}
      />
      <button
        onClick={inc}
        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
      >＋</button>
    </div>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending: { label: '未対応', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
    ordered: { label: '発注済み', bg: 'rgba(46,125,50,0.15)', fg: '#66bb6a' },
  }
  return map[status] ?? { label: status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
}
function paymentBadge(status: string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending: { label: '未決済', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
    paid: { label: '決済済み', bg: 'rgba(46,125,50,0.15)', fg: '#66bb6a' },
    failed: { label: '決済失敗', bg: 'rgba(211,47,47,0.15)', fg: '#ef5350' },
  }
  return map[status] ?? { label: status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function OrderHistory({ orders }: { orders: SupplyOrder[] }) {
  if (orders.length === 0) {
    return <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40 }}>発注履歴はありません</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map(o => {
        const sb = statusBadge(o.status)
        const pb = paymentBadge(o.paymentStatus)
        return (
          <div key={o.id} style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16, border: '1px solid var(--md-sys-color-outline-variant)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>{o.orderNumber}</span>
                <Badge {...pb} />
                <Badge {...sb} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                {new Date(o.createdAt).toLocaleString('ja-JP')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {o.items.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{it.productName}{it.sizeName ? `（${it.sizeName}）` : ''} × {it.quantity}</span>
                  <span>{yen(it.subtotal)}</span>
                </div>
              ))}
            </div>
            {o.note && <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 8px' }}>備考: {o.note}</p>}
            <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>合計</span>
              <span>{yen(o.totalAmount)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
