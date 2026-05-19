'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import { CUSTOMER_TYPE_LABEL, CUSTOMER_TYPE_BADGE, type CustomerType } from '@/lib/customer-types'

type Store = { id: string; name: string; code: string }
type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  address: string
  customerType: string
  customerTypes?: string
  createdAt: string
  store: Store | null
}

/** 定期訪問 / 定期宅配の顧客リストを表示する軽量ビュー。 */
export default function EcoBoxCustomersTab({ customerType }: { customerType: CustomerType }) {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.stores ?? [])
        setStores(list.map((s: any) => ({ id: s.id, name: s.name, code: s.code })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('customerType', customerType)
    params.set('limit', '200')
    fetch(`/api/admin/users?${params.toString()}`)
      .then(r => r.ok ? r.json() : { users: [], total: 0 })
      .then(d => {
        setCustomers(d.users || [])
        setTotal(d.total || 0)
      })
      .finally(() => setLoading(false))
  }, [customerType])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter(c => {
      if (filterStore && c.store?.id !== filterStore) return false
      if (q) {
        const hay = [c.name, c.furigana, c.email ?? '', c.phone].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [customers, search, filterStore])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><LoadingSpinner /></div>
  }

  const badge = CUSTOMER_TYPE_BADGE[customerType]
  const label = CUSTOMER_TYPE_LABEL[customerType]

  return (
    <div style={{ color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          <span style={{ padding: '2px 10px', borderRadius: 12, fontWeight: 600, marginRight: 8, background: badge.bg, color: badge.fg }}>{label}</span>
          顧客 {filtered.length}名 表示 / 全 {total}名
        </p>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="氏名・メール・電話で検索"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
        />
        <select
          value={filterStore} onChange={e => setFilterStore(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
        >
          <option value="">すべての店舗</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* リスト */}
      <div style={{ borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface-container)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.2fr 1.2fr 0.8fr 100px', gap: 12, padding: '10px 14px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-high)' }}>
          <span>氏名</span>
          <span>メール</span>
          <span>電話番号</span>
          <span>担当店舗</span>
          <span>登録日</span>
          <span></span>
        </div>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当する顧客はいません</p>
        ) : (
          filtered.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.2fr 1.2fr 0.8fr 100px', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--md-sys-color-outline-variant)', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.furigana}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email ?? '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{c.phone || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.store?.name ?? '未割当'}</div>
              <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{format(new Date(c.createdAt), 'yyyy/M/d', { locale: ja })}</div>
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => router.push(`/admin/customers?customer=${c.id}`)}
                  style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-primary)', border: '1px solid var(--md-sys-color-outline)', fontSize: 12, cursor: 'pointer' }}
                >
                  詳細
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
