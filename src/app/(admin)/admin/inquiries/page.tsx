'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'

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
  const [inquiryTypeFilter, setInquiryTypeFilter] = useState('')
  const [selected, setSelected] = useState<Inquiry | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [allStores, setAllStores] = useState<{ id: string; name: string; code: string }[]>([])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/stores')
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = Array.isArray(d) ? d : (d.stores ?? [])
        setAllStores(list.map((s: any) => ({ id: s.id, name: s.name, code: s.code })))
      })
      .catch(() => {})
  }, [status])

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

  const inquiryTypes = useMemo(() => {
    const set = new Set<string>()
    inquiries.forEach(i => { if (i.inquiryType) set.add(i.inquiryType) })
    return [...set].sort()
  }, [inquiries])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return inquiries.filter(i => {
      if (storeFilter && i.storeId !== storeFilter) return false
      if (statusFilter && i.status !== statusFilter) return false
      if (inquiryTypeFilter && i.inquiryType !== inquiryTypeFilter) return false
      if (q) {
        const hay = [i.name, i.furigana, i.phone, i.email ?? '', i.address, i.details ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [inquiries, searchText, storeFilter, statusFilter, inquiryTypeFilter])

  async function handleExportToSheet() {
    if (exporting) return
    const ids = filtered.map(f => f.id)
    if (ids.length === 0) {
      alert('エクスポート対象がありません')
      return
    }
    if (!confirm(`現在の絞り込み結果 ${ids.length} 件をスプレッドシートへ追記しますか？`)) return
    setExporting(true)
    try {
      const res = await fetch('/api/admin/inquiries/export-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryIds: ids }),
      })
      const data = await res.json()
      alert(data.message || (res.ok ? 'エクスポートしました' : 'エクスポートに失敗しました'))
    } catch (e) {
      alert('エクスポートに失敗しました')
    } finally {
      setExporting(false)
    }
  }

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
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>お問い合わせ管理</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
            全店舗の問い合わせフォームから受け付けた依頼（{filtered.length}件 / 全{inquiries.length}件）
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleExportToSheet}
            disabled={exporting}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: exporting ? 'wait' : 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'エクスポート中...' : 'スプレッドシートへエクスポート'}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            CSVインポート
          </button>
        </div>
      </div>

      {/* CSVインポートモーダル */}
      {importOpen && (
        <ImportModal
          stores={allStores}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            // 一覧を再取得
            fetch('/api/admin/inquiries')
              .then(r => r.ok ? r.json() : [])
              .then((d: Inquiry[]) => setInquiries(d))
          }}
        />
      )}

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
                placeholder="検索（氏名/電話/メール/住所/相談内容）"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 36px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <StoreFilterSelect
                value={storeFilter}
                onChange={setStoreFilter}
                stores={stores}
                style={{ flex: 1 }}
              />
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
            <select
              value={inquiryTypeFilter}
              onChange={e => setInquiryTypeFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
            >
              <option value="">すべての申込み内容</option>
              {inquiryTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
                      <img loading="lazy" decoding="async" src={urls[0]} alt={memo.title} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
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

/* ─── CSVインポートモーダル ─── */
type ImportResult = { created: number; errors: { row: number; message: string }[] }

function ImportModal({
  stores,
  onClose,
  onImported,
}: {
  stores: { id: string; name: string; code: string }[]
  onClose: () => void
  onImported: () => void
}) {
  const [mode, setMode] = useState<'all' | 'store'>('all')
  const [storeId, setStoreId] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleImport(file: File) {
    if (mode === 'store' && !storeId) {
      setError('店舗を選択してください')
      return
    }
    setImporting(true)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (mode === 'store') fd.append('storeId', storeId)
      const res = await fetch('/api/admin/inquiries/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.created) {
        setError(data.error ?? 'インポートに失敗しました')
        if (Array.isArray(data.errors)) setResult({ created: 0, errors: data.errors })
        return
      }
      setResult({ created: data.created ?? 0, errors: data.errors ?? [] })
      if (data.created > 0) onImported()
    } finally {
      setImporting(false)
    }
  }

  const sampleHref = mode === 'store'
    ? '/api/admin/inquiries/import?scope=store'
    : '/api/admin/inquiries/import'

  return (
    <div
      onClick={() => !importing && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>お問い合わせをCSVインポート</h2>
          <button onClick={() => !importing && onClose()} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* モード切替 */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 10, marginBottom: 16 }}>
          {([
            { v: 'all', label: '全店舗まとめてインポート' },
            { v: 'store', label: '店舗を指定してインポート' },
          ] as const).map(opt => {
            const active = mode === opt.v
            return (
              <button
                key={opt.v}
                onClick={() => { setMode(opt.v); setResult(null); setError('') }}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: active ? 'var(--md-sys-color-surface)' : 'transparent',
                  color: active ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {mode === 'all'
            ? 'CSVに記載された 店舗コード をもとに、各行を該当店舗のお問い合わせとして登録します。'
            : '指定した店舗にすべての行を紐付けて登録します。CSVに店舗コード列は不要です。'}
        </p>

        {mode === 'store' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>登録先の店舗</label>
            <StoreFilterSelect
              value={storeId}
              onChange={setStoreId}
              stores={stores}
              allLabel="— 店舗を選択 —"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <a
            href={sampleHref}
            download
            style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', textDecoration: 'none', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            ⬇ サンプルCSVをダウンロード
          </a>
        </div>

        <div style={{ marginBottom: 12, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>必須列:</strong><br />
          {mode === 'all' && '・店舗コード（既存店舗のもの）'}{mode === 'all' && <br />}
          ・氏名 / フリガナ / 電話 / 申込内容<br />
          <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>任意列:</strong> 受付日時 / メール / 郵便番号 / 住所 / 相談内容 / ステータス（新規/対応中/完了）
        </div>

        {!result && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', borderRadius: 12, border: '2px dashed var(--md-sys-color-outline-variant)', cursor: importing || (mode === 'store' && !storeId) ? 'not-allowed' : 'pointer', fontSize: 13, opacity: importing || (mode === 'store' && !storeId) ? 0.5 : 1 }}>
            {importing ? 'インポート中…' : '📎 CSVファイルを選択'}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              disabled={importing || (mode === 'store' && !storeId)}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
            />
          </label>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 8, background: result.created > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)', color: result.created > 0 ? '#4ade80' : '#fbbf24', fontSize: 13, marginBottom: 12 }}>
              ✓ {result.created} 件のお問い合わせを登録しました
              {result.errors.length > 0 && `（${result.errors.length} 件はエラーでスキップ）`}
            </div>
            {result.errors.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>エラー詳細:</div>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#f87171', marginBottom: 4 }}>
                    行 {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setResult(null); setError('') }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                続けてインポート
              </button>
              <button
                onClick={onClose}
                style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
