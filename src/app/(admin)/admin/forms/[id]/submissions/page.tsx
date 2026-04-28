'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import LoadingSpinner from '@/components/LoadingSpinner'
import { parseSchema, type FormSchema } from '@/lib/forms/types'

type Submission = {
  id: string
  formId: string
  data: string
  ipAddress: string | null
  userAgent: string | null
  sheetSyncedAt: string | null
  sheetSyncError: string | null
  createdAt: string
}

type ApiResponse = {
  form: { id: string; title: string; schema: string }
  total: number
  page: number
  limit: number
  submissions: Submission[]
}

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState<string | null>(null)

  useEffect(() => { void load() }, [id])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/forms/${id}/submissions`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  async function resync(subId: string) {
    setResyncing(subId)
    try {
      const res = await fetch(`/api/admin/forms/${id}/submissions/${subId}/resync-sheet`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) alert(j.error ?? '再同期に失敗しました')
      await load()
    } finally {
      setResyncing(null)
    }
  }

  if (loading || !data) return <LoadingSpinner size="lg" fullPage />

  const schema: FormSchema = parseSchema(data.form.schema)
  const labelById: Record<string, string> = {}
  for (const f of schema) {
    if (f.type === 'heading' || f.type === 'paragraph') continue
    labelById[f.id] = (f as any).label
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <Link href="/admin/forms" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            一覧へ戻る
          </Link>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mt-1 truncate">{data.form.title}</h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">合計 {data.total} 件の回答</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href={`/api/admin/forms/${id}/submissions/export`} download>
            <Button variant="outlined" size="md">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
              CSVダウンロード
            </Button>
          </a>
          <Link href={`/admin/forms/${id}/edit`}>
            <Button variant="outlined" size="md">フォーム編集</Button>
          </Link>
        </div>
      </div>

      {data.submissions.length === 0 ? (
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
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">シート同期</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map(s => {
                  const isOpen = openId === s.id
                  let parsed: Record<string, unknown> = {}
                  try { parsed = JSON.parse(s.data) } catch { /* ignore */ }
                  return (
                    <Fragment key={s.id}>
                      <tr
                        className="hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                        style={{ boxShadow: 'rgba(255,255,255,0.06) 0 1px 0 0 inset' }}
                      >
                        <td className="px-4 py-3 text-[var(--md-sys-color-on-surface)]">{new Date(s.createdAt).toLocaleString('ja-JP')}</td>
                        <td className="px-4 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">{s.id}</td>
                        <td className="px-4 py-3"><SyncBadge synced={!!s.sheetSyncedAt} error={s.sheetSyncError} /></td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-2">
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
                          <td colSpan={4} className="px-4 py-4">
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

function SyncBadge({ synced, error }: { synced: boolean; error: string | null }) {
  if (synced) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
        同期済
      </span>
    )
  }
  if (error) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }} title={error}>
        失敗
      </span>
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
