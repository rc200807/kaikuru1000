'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'

type PurchaseMemo = {
  id: string
  title: string
  imageUrls: string
  status: string
}

type Inquiry = {
  id: string
  storeId: string
  store: { id: string; name: string; code: string }
  name: string
  furigana: string
  phone: string
  email: string | null
  postalCode: string | null
  address: string
  inquiryType: string
  details: string | null
  status: string // new | contacted | completed
  userId: string | null
  user: { id: string; name: string; email: string | null; phone: string | null; customerType: string } | null
  purchaseMemos: PurchaseMemo[]
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  new: '新規',
  contacted: '対応中',
  completed: '完了',
}
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  new:       { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  contacted: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  completed: { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
}

export default function AdminInquiriesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Inquiry | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    setLoading(true)
    fetch('/api/admin/inquiries')
      .then(r => r.ok ? r.json() : [])
      .then((d: Inquiry[]) => setInquiries(d))
      .finally(() => setLoading(false))
  }, [status])

  const stores = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    inquiries.forEach(i => map.set(i.store.id, { id: i.store.id, name: i.store.name }))
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [inquiries])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return inquiries.filter(i => {
      if (storeFilter && i.storeId !== storeFilter) return false
      if (statusFilter && i.status !== statusFilter) return false
      if (q) {
        const hay = [i.name, i.furigana, i.phone, i.email ?? '', i.address].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [inquiries, searchText, storeFilter, statusFilter])

  async function updateStatus(inquiry: Inquiry, newStatus: string) {
    const res = await fetch(`/api/admin/inquiries/${inquiry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) return
    setInquiries(prev => prev.map(x => x.id === inquiry.id ? { ...x, status: newStatus } : x))
    setSelected(prev => prev && prev.id === inquiry.id ? { ...prev, status: newStatus } : prev)
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>お問い合わせ管理</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        全店舗の問い合わせフォームから受け付けた依頼を一覧表示しています（{filtered.length}件 / 全{inquiries.length}件）
      </p>

      {/* フィルタバー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 240px', minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>検索（氏名/フリガナ/電話/メール/住所）</label>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="例: 山田 / 090..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 150 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>店舗</label>
          <select
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            <option value="">すべての店舗</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>ステータス</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            <option value="">すべて</option>
            <option value="new">新規</option>
            <option value="contacted">対応中</option>
            <option value="completed">完了</option>
          </select>
        </div>
        {(searchText || storeFilter || statusFilter) && (
          <button
            onClick={() => { setSearchText(''); setStoreFilter(''); setStatusFilter('') }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            クリア
          </button>
        )}
      </div>

      {/* テーブル */}
      <div style={{ background: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当するお問い合わせがありません</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                  <Th>受付日時</Th>
                  <Th>店舗</Th>
                  <Th>氏名</Th>
                  <Th>電話</Th>
                  <Th>申込内容</Th>
                  <Th>品目</Th>
                  <Th>ステータス</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr
                    key={i.id}
                    onClick={() => setSelected(i)}
                    style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer' }}
                  >
                    <Td>{new Date(i.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                    <Td>{i.store.name}</Td>
                    <Td>
                      <div>{i.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{i.furigana}</div>
                    </Td>
                    <Td>{i.phone}</Td>
                    <Td>{i.inquiryType}</Td>
                    <Td>{i.purchaseMemos.length > 0 ? `${i.purchaseMemos.length}点` : '—'}</Td>
                    <Td><StatusBadge status={i.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailModal inquiry={selected} onClose={() => setSelected(null)} onStatusChange={s => updateStatus(selected, s)} />
      )}
    </div>
  )
}

/* ─── 詳細モーダル ─── */
function DetailModal({ inquiry, onClose, onStatusChange }: { inquiry: Inquiry; onClose: () => void; onStatusChange: (status: string) => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>お問い合わせ詳細</h2>
            <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>
              {new Date(inquiry.createdAt).toLocaleString('ja-JP')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* ステータス変更 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['new', 'contacted', 'completed'] as const).map(s => {
            const active = inquiry.status === s
            const c = STATUS_COLOR[s]
            return (
              <button
                key={s}
                onClick={() => !active && onStatusChange(s)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: active ? 'default' : 'pointer',
                  border: active ? `1px solid ${c.fg}` : '1px solid var(--md-sys-color-outline-variant)',
                  background: active ? c.bg : 'transparent',
                  color: active ? c.fg : 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            )
          })}
        </div>

        {/* フィールド一覧 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Field label="店舗" value={`${inquiry.store.name}（${inquiry.store.code}）`} />
          <Field label="申込内容" value={inquiry.inquiryType} />
          <Field label="氏名" value={inquiry.name} />
          <Field label="フリガナ" value={inquiry.furigana} />
          <Field label="電話" value={inquiry.phone} />
          <Field label="メール" value={inquiry.email || '—'} />
          <Field label="郵便番号" value={inquiry.postalCode ? `〒${inquiry.postalCode}` : '—'} />
          <Field label="住所" value={inquiry.address} wide />
        </div>

        {inquiry.details && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>相談内容</div>
            <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {inquiry.details}
            </div>
          </div>
        )}

        {inquiry.user && (
          <div style={{ marginBottom: 20, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>紐付け顧客</div>
            <Link href={`/admin/customers?focus=${inquiry.user.id}`} style={{ fontSize: 13, color: '#4f8ef7', textDecoration: 'none' }}>
              {inquiry.user.name} {inquiry.user.email && `(${inquiry.user.email})`}
            </Link>
          </div>
        )}

        {inquiry.purchaseMemos.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 8 }}>申込品目（{inquiry.purchaseMemos.length}点）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {inquiry.purchaseMemos.map(memo => {
                let urls: string[] = []
                try { urls = JSON.parse(memo.imageUrls) } catch {}
                return (
                  <div key={memo.id} style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, overflow: 'hidden' }}>
                    {urls[0] ? (
                      <a href={urls[0]} target="_blank" rel="noreferrer">
                        <img src={urls[0]} alt={memo.title} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                      </a>
                    ) : (
                      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.4 }}>📷</div>
                    )}
                    <div style={{ padding: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{memo.title}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 補助 ─── */
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>{children}</td>
}
function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  )
}
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.new
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}
