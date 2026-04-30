'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import LoadingSpinner from '@/components/LoadingSpinner'
import { parseSchema, type FormSchema } from '@/lib/forms/types'
import { CUSTOMER_TYPE_LABEL, CUSTOMER_TYPE_BADGE, parseCustomerTypes, type CustomerType } from '@/lib/customer-types'

type FormDetail = {
  id: string
  slug: string
  title: string
  description: string | null
  schema: string
  status: 'draft' | 'published' | 'closed'
  notifyEmails: string | null
  successMessage: string | null
  sheetWebhookUrl: string | null
  recaptchaEnabled: boolean
  customerCreate: boolean
  customerType: string | null
  customerTypes: string | null
  customerFieldMap: string | null
  customerStoreId: string | null
  submissionCount: number
  createdAt: string
  updatedAt: string
}

type Submission = {
  id: string
  formId: string
  data: string
  ipAddress: string | null
  userAgent: string | null
  sheetSyncedAt: string | null
  sheetSyncError: string | null
  userId?: string | null
  createdAt: string
}

type SubmissionsResponse = {
  form: { id: string; title: string; schema: string }
  total: number
  page: number
  limit: number
  submissions: Submission[]
}

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  draft:     { label: '下書き',   bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  published: { label: '公開中',   bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
  closed:    { label: '受付終了', bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
}

export default function FormDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [form, setForm] = useState<FormDetail | null>(null)
  const [subs, setSubs] = useState<SubmissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { void load() }, [id])

  async function load() {
    setLoading(true)
    const [fRes, sRes] = await Promise.all([
      fetch(`/api/admin/forms/${id}`),
      fetch(`/api/admin/forms/${id}/submissions`),
    ])
    if (fRes.ok) setForm(await fRes.json())
    if (sRes.ok) setSubs(await sRes.json())
    setLoading(false)
  }

  async function resync(subId: string) {
    setResyncing(subId)
    try {
      const res = await fetch(`/api/admin/forms/${id}/submissions/${subId}/resync-sheet`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) alert(j.error ?? '再同期に失敗しました')
      const sRes = await fetch(`/api/admin/forms/${id}/submissions`)
      if (sRes.ok) setSubs(await sRes.json())
    } finally {
      setResyncing(null)
    }
  }

  function copyUrl() {
    if (!form) return
    const url = `${window.location.origin}/f/${form.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !form) return <LoadingSpinner size="lg" fullPage />

  const schema: FormSchema = parseSchema(form.schema)
  const labelById: Record<string, string> = {}
  for (const f of schema) {
    if (f.type === 'heading' || f.type === 'paragraph') continue
    labelById[f.id] = (f as any).label
  }

  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/f/${form.slug}`
  const st = STATUS_LABEL[form.status] ?? STATUS_LABEL.draft
  const customerTypesList: CustomerType[] = form.customerCreate ? parseCustomerTypes(form.customerTypes, form.customerType ?? undefined) : []

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <Link href="/admin/forms" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            一覧へ戻る
          </Link>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] truncate">{form.title}</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>
              {st.label}
            </span>
          </div>
          {form.description && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{form.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Button variant="outlined" size="md" onClick={copyUrl}>{copied ? 'コピー済' : 'URLコピー'}</Button>
          <a href={`/api/admin/forms/${id}/submissions/export`} download>
            <Button variant="outlined" size="md">CSVダウンロード</Button>
          </a>
          <Link href={`/admin/forms/${id}/edit`}>
            <Button size="md">フォーム編集</Button>
          </Link>
        </div>
      </div>

      {/* 基本情報 */}
      <Card variant="elevated" padding="md" className="mb-4">
        <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">基本情報</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="公開URL">
            <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[hsla(212,100%,68%,1)] hover:underline font-mono text-xs break-all">
              {publicUrl}
            </a>
          </Row>
          <Row label="回答数">
            <span className="font-medium text-[var(--md-sys-color-on-surface)]">{form.submissionCount} 件</span>
          </Row>
          <Row label="reCAPTCHA">{form.recaptchaEnabled ? '有効' : '無効'}</Row>
          <Row label="通知メール">{form.notifyEmails || <span className="text-[var(--md-sys-color-outline)]">未設定</span>}</Row>
          <Row label="シート同期">{form.sheetWebhookUrl ? <span className="text-xs font-mono break-all">{form.sheetWebhookUrl}</span> : <span className="text-[var(--md-sys-color-outline)]">未設定</span>}</Row>
          <Row label="更新日">{new Date(form.updatedAt).toLocaleString('ja-JP')}</Row>
        </dl>
      </Card>

      {/* 顧客自動作成設定（有効時のみ） */}
      {form.customerCreate && (
        <Card variant="outlined" padding="md" className="mb-4">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">顧客自動作成 <span className="text-xs font-normal text-[#4ade80] ml-2">有効</span></h2>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {customerTypesList.length === 0 ? (
              <span className="text-xs text-[var(--md-sys-color-outline)]">種別未設定</span>
            ) : customerTypesList.map(t => {
              const c = CUSTOMER_TYPE_BADGE[t]
              const isPrimary = t === form.customerType
              return (
                <span key={t} className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg, border: isPrimary ? `1px solid ${c.fg}` : 'none' }}>
                  {CUSTOMER_TYPE_LABEL[t]}{isPrimary && <span className="ml-1 opacity-75">(主)</span>}
                </span>
              )
            })}
          </div>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">氏名・電話が揃った回答時に顧客レコードを自動作成します。</p>
        </Card>
      )}

      {/* お問い合わせ（回答）一覧 */}
      <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-2 mt-6">お問い合わせ一覧（{subs?.total ?? 0}件）</h2>
      {!subs || subs.submissions.length === 0 ? (
        <Card variant="outlined" padding="none">
          <EmptyState title="まだ回答がありません" description="公開URLから送信された回答がここに表示されます" />
        </Card>
      ) : (
        <Card variant="elevated" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">受信日時</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">回答ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">顧客</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">シート同期</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {subs.submissions.map(s => {
                  const isOpen = openId === s.id
                  let parsed: Record<string, unknown> = {}
                  try { parsed = JSON.parse(s.data) } catch { /* ignore */ }
                  return (
                    <Fragment key={s.id}>
                      <tr
                        className="hover:bg-[var(--md-sys-color-surface-container)] transition-colors cursor-pointer"
                        style={{ boxShadow: 'rgba(255,255,255,0.06) 0 1px 0 0 inset' }}
                        onClick={() => setOpenId(isOpen ? null : s.id)}
                      >
                        <td className="px-4 py-3 text-[var(--md-sys-color-on-surface)]">{new Date(s.createdAt).toLocaleString('ja-JP')}</td>
                        <td className="px-4 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">{s.id.slice(0, 8)}…</td>
                        <td className="px-4 py-3">
                          {s.userId ? (
                            <Link href={`/admin/customers?focus=${s.userId}`} onClick={(e) => e.stopPropagation()} className="text-[hsla(212,100%,68%,1)] hover:underline text-xs">
                              紐付け済
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--md-sys-color-outline)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><SyncBadge synced={!!s.sheetSyncedAt} error={s.sheetSyncError} /></td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="outlined" size="sm" onClick={() => setOpenId(isOpen ? null : s.id)}>
                              {isOpen ? '閉じる' : '詳細'}
                            </Button>
                            {s.sheetSyncError && (
                              <Button variant="outlined" size="sm" loading={resyncing === s.id} onClick={() => resync(s.id)}>再同期</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}>
                          <td colSpan={5} className="px-4 py-4">
                            <table className="w-full text-sm">
                              <tbody>
                                {Object.entries(parsed).map(([k, v]) => (
                                  <tr key={k}>
                                    <td className="py-1.5 pr-4 text-[var(--md-sys-color-on-surface-variant)] align-top w-1/3 text-xs uppercase tracking-wide">{labelById[k] ?? k}</td>
                                    <td className="py-1.5 text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{formatVal(v)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {s.sheetSyncError && (
                              <p className="mt-3 text-xs" style={{ color: '#f87171' }}>シート同期エラー: {s.sheetSyncError}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 flex-shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)] pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--md-sys-color-on-surface)]">{children}</dd>
    </div>
  )
}

function SyncBadge({ synced, error }: { synced: boolean; error: string | null }) {
  if (synced) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>同期済</span>
    )
  }
  if (error) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }} title={error}>失敗</span>
    )
  }
  return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">−</span>
}

function formatVal(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') {
    const o = v as any
    if ('last' in o || 'first' in o) return `${o.last ?? ''} ${o.first ?? ''}`.trim()
    return JSON.stringify(v)
  }
  return String(v)
}
