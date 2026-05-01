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

  const selectedInquiry = selected ? (inquiries.find(i => i.id === selected.id) ?? selected) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>お問い合わせ管理</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          全店舗の問い合わせフォームから受け付けた依頼（{filtered.length}件 / 全{inquiries.length}件）
        </p>
      </div>

      {/* 分割レイアウト */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', overflow: 'hidden' }}>
        {/* 左ペイン: フィルタ + 一覧 */}
        <aside style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
          {/* フィルタバー */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--md-sys-color-on-surface-variant)', pointerEvents: 'none' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="検索（氏名/電話/メール/住所）"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 36px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={storeFilter}
                onChange={e => setStoreFilter(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
              >
                <option value="">すべての店舗</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ flex: '0 0 110px', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
              >
                <option value="">全ステータス</option>
                <option value="new">新規</option>
                <option value="contacted">対応中</option>
                <option value="completed">完了</option>
              </select>
            </div>
          </div>

          {/* リスト */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当するお問い合わせがありません</p>
            ) : (
              filtered.map(i => {
                const isActive = selected?.id === i.id
                return (
                  <button
                    key={i.id}
                    onClick={() => setSelected(i)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 14px',
                      borderTop: '1px solid var(--md-sys-color-outline-variant)',
                      borderLeft: isActive ? '3px solid #4f8ef7' : '3px solid transparent',
                      background: isActive ? 'rgba(79,142,247,0.1)' : 'transparent',
                      cursor: 'pointer', color: 'inherit', font: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {i.store.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(i.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.furigana}</div>
                      </div>
                      <StatusBadge status={i.status} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.inquiryType}</span>
                      {i.purchaseMemos.length > 0 && <span style={{ flexShrink: 0 }}>📷 {i.purchaseMemos.length}点</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* 右ペイン: 詳細 */}
        <main style={{ overflowY: 'auto' }}>
          {selectedInquiry ? (
            <DetailPane inquiry={selectedInquiry} onStatusChange={s => updateStatus(selectedInquiry, s)} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14, padding: 40, textAlign: 'center' }}>
              左のリストから問い合わせを選択してください
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ─── 詳細ペイン ─── */
function DetailPane({ inquiry, onStatusChange }: { inquiry: Inquiry; onStatusChange: (status: string) => void }) {
  return (
    <div style={{ padding: '20px 24px', maxWidth: 800 }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{inquiry.name}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--md-sys-color-on-surface-variant)', marginLeft: 8 }}>{inquiry.furigana}</span></h2>
        <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>
          {new Date(inquiry.createdAt).toLocaleString('ja-JP')} ・ {inquiry.store.name}（{inquiry.store.code}）
        </div>
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
        <Field label="申込内容" value={inquiry.inquiryType} />
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
