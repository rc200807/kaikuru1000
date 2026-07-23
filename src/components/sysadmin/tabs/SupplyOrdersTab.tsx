'use client'

import { useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { yen } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

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
  status: string
  paymentStatus: string
  note: string | null
  items: OrderItem[]
  createdAt: string
}

export default function SupplyOrdersTab() {
  const [orders, setOrders] = useState<SupplyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'ordered'>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  function load() {
    return fetch('/api/sysadmin/supply-orders')
      .then(r => (r.ok ? r.json() : []))
      .then(setOrders)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return orders
    return orders.filter(o => o.status === filter)
  }, [orders, filter])

  async function updateStatus(o: SupplyOrder, next: 'pending' | 'ordered') {
    setUpdating(o.id)
    try {
      const res = await fetch(`/api/sysadmin/supply-orders/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        const updated = await res.json()
        setOrders(prev => prev.map(x => (x.id === o.id ? updated : x)))
      }
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        管理ポータルから入った備品発注を確認し、ステータスを更新します（未対応 {pendingCount} 件）
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'pending', 'ordered'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--md-sys-color-outline-variant)',
              background: filter === f ? 'var(--md-sys-color-primary)' : 'transparent',
              color: filter === f ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
              fontWeight: filter === f ? 700 : 500,
            }}
          >
            {f === 'all' ? 'すべて' : f === 'pending' ? '未対応' : '発注済み'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40 }}>発注はありません</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(o => {
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
                    {formatJstDateTime(o.createdAt)} ／ 発注者: {o.placedByName}
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
                <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>合計 {yen(o.totalAmount)}</span>
                  {o.status === 'pending' ? (
                    <button
                      onClick={() => updateStatus(o, 'ordered')}
                      disabled={updating === o.id}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: updating === o.id ? 0.6 : 1 }}
                    >
                      {updating === o.id ? '更新中…' : '発注済みにする'}
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(o, 'pending')}
                      disabled={updating === o.id}
                      style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 13, cursor: 'pointer', opacity: updating === o.id ? 0.6 : 1 }}
                    >
                      未対応に戻す
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
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
