'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchInquiries()
    }
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

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  const inquiryFormUrl = `https://system.rcinc.jp/inquiry/${storeCode}`

  return (
    <div className="max-w-4xl mx-auto pb-24 md:pb-8">
      <AppBar title="問い合わせ一覧" />

      <div className="px-4 sm:px-6 space-y-4">
        {/* Inquiry form URL card */}
        {storeCode && (
          <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                問い合わせフォームURL
              </p>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
              このURLをお客様に共有して、問い合わせを受け付けることができます。
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
                <p className="text-sm text-[var(--md-sys-color-on-surface)] truncate font-mono">
                  {inquiryFormUrl}
                </p>
              </div>
              <button
                onClick={handleCopyUrl}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--store-primary)] text-[var(--store-on-primary)] hover:opacity-90 active:opacity-80 transition-opacity"
              >
                {copied ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    コピー済み
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                    URLをコピー
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Status filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
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

        {/* Inquiry list */}
        {inquiries.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            }
            title="問い合わせはありません"
            description={filterStatus !== 'all' ? 'フィルターを変更してみてください' : '新しい問い合わせが届くとここに表示されます'}
          />
        ) : (
          <div className="space-y-3">
            {inquiries.map(inq => {
              const isExpanded = expandedId === inq.id
              const statusConf = STATUS_CONFIG[inq.status] ?? STATUS_CONFIG.new
              const typeLabel = INQUIRY_TYPES[inq.inquiryType] ?? inq.inquiryType

              return (
                <div
                  key={inq.id}
                  className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : inq.id)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConf.bg} ${statusConf.text}`}>
                            {statusConf.label}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {typeLabel}
                          </span>
                          <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto">
                            {format(new Date(inq.createdAt), 'yyyy/M/d HH:mm', { locale: ja })}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                          {inq.name}
                          {inq.furigana && (
                            <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)] ml-2">
                              ({inq.furigana})
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          <span>{inq.phone}</span>
                          {inq.email && <span>{inq.email}</span>}
                        </div>
                      </div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className={`w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[var(--md-sys-color-outline-variant)]">
                      <div className="pt-3 space-y-3">
                        {/* Detail fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">住所</p>
                            <p className="text-[var(--md-sys-color-on-surface)]">
                              {inq.postalCode && `〒${inq.postalCode} `}{inq.address}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">申込内容</p>
                            <p className="text-[var(--md-sys-color-on-surface)]">{typeLabel}</p>
                          </div>
                          {inq.email && (
                            <div>
                              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">メール</p>
                              <p className="text-[var(--md-sys-color-on-surface)]">{inq.email}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">電話番号</p>
                            <p className="text-[var(--md-sys-color-on-surface)]">{inq.phone}</p>
                          </div>
                        </div>

                        {/* Details text */}
                        {inq.details && (
                          <div>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-0.5">相談内容</p>
                            <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-[var(--md-sys-color-surface-container)] rounded-xl p-3">
                              {inq.details}
                            </p>
                          </div>
                        )}

                        {/* Linked customer */}
                        {inq.userId && inq.user && (
                          <div>
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">紐付き顧客</p>
                            <button
                              onClick={() => router.push(`/store/customers/${inq.userId}`)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--store-primary)] bg-[var(--store-primary-container)]/30 hover:bg-[var(--store-primary-container)]/60 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                              {inq.user.name}
                            </button>
                          </div>
                        )}

                        {/* Status change */}
                        <div className="flex items-center gap-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">ステータス変更:</p>
                          <select
                            value={inq.status}
                            onChange={(e) => handleStatusChange(inq.id, e.target.value)}
                            disabled={updatingId === inq.id}
                            className="text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--store-primary)] disabled:opacity-50"
                          >
                            <option value="new">新規</option>
                            <option value="contacted">対応中</option>
                            <option value="completed">完了</option>
                          </select>
                          {updatingId === inq.id && (
                            <LoadingSpinner size="sm" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
