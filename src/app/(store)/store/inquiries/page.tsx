'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

type PurchaseMemo = {
  id: string
  title: string
  imageUrls: string
  status: string
}

type Inquiry = {
  id: string
  name: string
  furigana: string
  phone: string
  email: string | null
  postalCode: string | null
  address: string
  inquiryType: string
  details: string | null
  status: string
  userId: string | null
  user: { id: string; name: string } | null
  purchaseMemos: PurchaseMemo[]
  createdAt: string
}

const INQUIRY_TYPES: Record<string, string> = {
  assessment: '査定申込',
  purchase: '買取申込',
  estate: '遺品整理',
  other: 'その他',
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new:       { label: '新規',   bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-800 dark:text-blue-300' },
  contacted: { label: '対応中', bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-800 dark:text-yellow-300' },
  completed: { label: '完了',   bg: 'bg-green-100 dark:bg-green-900/40',  text: 'text-green-800 dark:text-green-300' },
}

export default function StoreInquiriesPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [storeCode, setStoreCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus === 'authenticated') fetchInquiries()
  }, [authStatus, filterStatus])

  async function fetchInquiries() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/store/inquiries?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInquiries(data.inquiries ?? [])
        setStoreCode(data.storeCode ?? '')
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(inquiryId: string, newStatus: string) {
    setUpdatingId(inquiryId)
    try {
      const res = await fetch('/api/store/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, status: newStatus }),
      })
      if (res.ok) {
        setInquiries(prev =>
          prev.map(inq => inq.id === inquiryId ? { ...inq, status: newStatus } : inq)
        )
      }
    } catch {
      // ignore
    } finally {
      setUpdatingId(null)
    }
  }

  function handleCopyUrl() {
    const url = `https://system.rcinc.jp/inquiry/${storeCode}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return inquiries
    return inquiries.filter(i => {
      const hay = [i.name, i.furigana, i.phone, i.email ?? '', i.address].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [inquiries, searchText])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return inquiries.find(i => i.id === selectedId) ?? null
  }, [inquiries, selectedId])

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  const inquiryFormUrl = `https://system.rcinc.jp/inquiry/${storeCode}`

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <AppBar title="問い合わせ一覧" />

      {/* 問い合わせフォームURL */}
      {storeCode && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">店舗専用問い合わせフォーム</p>
            </div>
            <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
              <p className="text-xs text-[var(--md-sys-color-on-surface)] truncate font-mono">{inquiryFormUrl}</p>
            </div>
            <button
              onClick={handleCopyUrl}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--store-primary)] text-[var(--store-on-primary)] hover:opacity-90 transition-opacity"
            >
              {copied ? '✓ コピー済み' : 'URLをコピー'}
            </button>
          </div>
        </div>
      )}

      {/* 分割レイアウト */}
      <div className="flex-1 grid overflow-hidden mt-3" style={{ gridTemplateColumns: 'minmax(280px, 360px) 1fr' }}>
        {/* 左ペイン: フィルタ + 一覧 */}
        <aside className="flex flex-col border-r border-[var(--md-sys-color-outline-variant)] overflow-hidden bg-[var(--md-sys-color-surface)]">
          {/* フィルタ */}
          <div className="p-3 border-b border-[var(--md-sys-color-outline-variant)] flex flex-col gap-2">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="🔍 検索（氏名/電話/メール/住所）"
              className="w-full px-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
            />
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { value: 'all', label: 'すべて' },
                { value: 'new', label: '新規' },
                { value: 'contacted', label: '対応中' },
                { value: 'completed', label: '完了' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilterStatus(opt.value)}
                  className={`
                    px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0
                    ${filterStatus === opt.value
                      ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                      : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* リスト */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-10 px-6 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                {searchText || filterStatus !== 'all' ? '該当する問い合わせがありません' : '問い合わせはまだありません'}
              </div>
            ) : (
              filtered.map(inq => {
                const isActive = selectedId === inq.id
                const statusConf = STATUS_CONFIG[inq.status] ?? STATUS_CONFIG.new
                const typeLabel = INQUIRY_TYPES[inq.inquiryType] ?? inq.inquiryType
                return (
                  <button
                    key={inq.id}
                    onClick={() => setSelectedId(inq.id)}
                    className={`
                      block w-full text-left px-4 py-3 border-t border-[var(--md-sys-color-outline-variant)] transition-colors
                      ${isActive
                        ? 'bg-[var(--store-primary-container)]/30 border-l-[3px] border-l-[var(--store-primary)]'
                        : 'border-l-[3px] border-l-transparent hover:bg-[var(--md-sys-color-surface-container)]'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusConf.bg} ${statusConf.text}`}>
                        {statusConf.label}
                      </span>
                      <span className="text-[10px] text-[var(--md-sys-color-outline)] whitespace-nowrap">
                        {format(new Date(inq.createdAt), 'M/d HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{inq.name}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">{inq.furigana}</div>
                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex justify-between gap-2 mt-1">
                      <span className="truncate">{typeLabel}</span>
                      {inq.purchaseMemos.length > 0 && <span className="shrink-0">📷 {inq.purchaseMemos.length}点</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* 右ペイン: 詳細 */}
        <main className="overflow-y-auto">
          {selected ? (
            <DetailPane
              inquiry={selected}
              updating={updatingId === selected.id}
              onStatusChange={(s) => handleStatusChange(selected.id, s)}
              onOpenCustomer={(uid) => router.push(`/store/customers/${uid}`)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--md-sys-color-on-surface-variant)] p-10 text-center">
              左のリストから問い合わせを選択してください
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ─── 詳細ペイン ─── */
function DetailPane({
  inquiry,
  updating,
  onStatusChange,
  onOpenCustomer,
}: {
  inquiry: Inquiry
  updating: boolean
  onStatusChange: (status: string) => void
  onOpenCustomer: (userId: string) => void
}) {
  const typeLabel = INQUIRY_TYPES[inquiry.inquiryType] ?? inquiry.inquiryType
  const statusConf = STATUS_CONFIG[inquiry.status] ?? STATUS_CONFIG.new

  return (
    <div className="px-5 py-5 max-w-3xl">
      {/* ヘッダー */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
          {inquiry.name}
          {inquiry.furigana && <span className="text-sm font-normal text-[var(--md-sys-color-on-surface-variant)] ml-2">({inquiry.furigana})</span>}
        </h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
          {format(new Date(inquiry.createdAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
        </p>
      </div>

      {/* ステータス + 種別バッジ */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusConf.bg} ${statusConf.text}`}>
          {statusConf.label}
        </span>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {typeLabel}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">ステータス:</span>
          <select
            value={inquiry.status}
            onChange={(e) => onStatusChange(e.target.value)}
            disabled={updating}
            className="text-xs rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--store-primary)] disabled:opacity-50"
          >
            <option value="new">新規</option>
            <option value="contacted">対応中</option>
            <option value="completed">完了</option>
          </select>
          {updating && <LoadingSpinner size="sm" />}
        </div>
      </div>

      {/* フィールド一覧 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Field label="電話番号" value={inquiry.phone} />
        <Field label="メール" value={inquiry.email || '—'} />
        <Field label="郵便番号" value={inquiry.postalCode ? `〒${inquiry.postalCode}` : '—'} />
        <Field label="住所" value={inquiry.address || '—'} wide />
      </div>

      {/* 相談内容 */}
      {inquiry.details && (
        <div className="mb-5">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">相談内容</p>
          <div className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-[var(--md-sys-color-surface-container)] rounded-xl p-3">
            {inquiry.details}
          </div>
        </div>
      )}

      {/* 紐付け顧客 */}
      {inquiry.userId && inquiry.user && (
        <div className="mb-5">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">紐付け顧客</p>
          <button
            onClick={() => onOpenCustomer(inquiry.userId!)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--store-primary)] bg-[var(--store-primary-container)]/30 hover:bg-[var(--store-primary-container)]/60 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {inquiry.user.name}
          </button>
        </div>
      )}

      {/* 申込品目 */}
      {inquiry.purchaseMemos.length > 0 && (
        <div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">申込品目（{inquiry.purchaseMemos.length}点）</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {inquiry.purchaseMemos.map(memo => {
              let urls: string[] = []
              try { urls = JSON.parse(memo.imageUrls) } catch { /* ignore */ }
              return (
                <div key={memo.id} className="bg-[var(--md-sys-color-surface-container)] rounded-lg overflow-hidden">
                  {urls[0] ? (
                    <a href={urls[0]} target="_blank" rel="noreferrer" className="block">
                      <img src={urls[0]} alt={memo.title} className="w-full h-28 object-cover" />
                    </a>
                  ) : (
                    <div className="h-28 flex items-center justify-center text-2xl opacity-40">📷</div>
                  )}
                  <div className="px-2 py-1.5 text-xs font-semibold leading-tight text-[var(--md-sys-color-on-surface)]">
                    {memo.title}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">{label}</p>
      <p className="text-sm text-[var(--md-sys-color-on-surface)] break-words">{value}</p>
    </div>
  )
}
