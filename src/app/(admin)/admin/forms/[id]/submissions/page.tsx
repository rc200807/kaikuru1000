'use client'

import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import LoadingSpinner from '@/components/LoadingSpinner'
import { parseSchema, formAdminLabel, type FormSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'
import { applyLegacyFieldMap, parseLegacyFieldMap } from '@/lib/forms/legacy-field-map'

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
  form: { id: string; title: string; internalName: string | null; schema: string; legacyFieldMap: string | null }
  total: number
  page: number
  limit: number
  submissions: Submission[]
}

type LegacyInfo = {
  unassigned: { key: string; samples: string[]; count: number; suggestedFieldId: string | null }[]
  map: Record<string, string>
  questions: { id: string; label: string; type: string }[]
}

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [data, setData] = useState<ApiResponse | null>(null)
  const [legacy, setLegacy] = useState<LegacyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState<string | null>(null)

  useEffect(() => { void load() }, [id])

  async function load() {
    setLoading(true)
    const [res, legacyRes] = await Promise.all([
      fetch(`/api/admin/forms/${id}/submissions`),
      fetch(`/api/admin/forms/${id}/legacy-fields`),
    ])
    if (res.ok) setData(await res.json())
    setLegacy(legacyRes.ok ? await legacyRes.json() : null)
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
  const legacyMap = parseLegacyFieldMap(data.form.legacyFieldMap)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <Link href="/admin/forms" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            一覧へ戻る
          </Link>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mt-1 truncate">{formAdminLabel(data.form)}</h1>
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

      {legacy && legacy.unassigned.length > 0 && (
        <LegacyFieldAssigner formId={id} legacy={legacy} onSaved={load} />
      )}

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
                                {formatAnswersForDisplay(schema, applyLegacyFieldMap(schema, parsed, legacyMap), { includeUnknown: true }).map((a, i) => (
                                  <tr key={i}>
                                    <td className="py-1.5 pr-4 text-[var(--md-sys-color-on-surface-variant)] align-top w-1/3 text-xs uppercase tracking-wide">{a.label}</td>
                                    <td className="py-1.5 text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{a.value || '—'}</td>
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

/**
 * 設問を作り直すと項目IDが変わり、それ以前の回答が現在の設問と結びつかなくなる。
 * どの設問の回答だったかを選んで保存すると、詳細表示・CSVで本来の設問の位置に入る。
 */
function LegacyFieldAssigner({ formId, legacy, onSaved }: { formId: string; legacy: LegacyInfo; onSaved: () => Promise<void> | void }) {
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(legacy.unassigned.map(u => [u.key, u.suggestedFieldId ?? '']))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedCount = Object.values(choices).filter(Boolean).length

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = { ...legacy.map }
      for (const [key, fieldId] of Object.entries(choices)) {
        if (fieldId) next[key] = fieldId
      }
      const res = await fetch(`/api/admin/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacyFieldMap: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? '保存に失敗しました')
        return
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card variant="outlined" padding="none">
      <div className="p-4 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">未割り当ての回答（{legacy.unassigned.length}件）</h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
          設問を作り直すと項目IDが変わり、それ以前の回答が現在の設問と結びつかなくなります。
          どの設問への回答だったかを選んで保存すると、回答詳細とCSVで本来の設問の位置に表示されます（保存されている回答自体は書き換えません）。
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        {legacy.unassigned.map(u => (
          <div key={u.key} className="p-4 grid gap-3 sm:grid-cols-[1fr_260px] sm:items-start">
            <div className="min-w-0">
              <p className="text-sm text-[var(--md-sys-color-on-surface)] break-words">{u.samples.join(' / ') || '（値なし）'}</p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 font-mono break-all">{u.key}・{u.count}件</p>
            </div>
            <select
              value={choices[u.key] ?? ''}
              onChange={(e) => setChoices(prev => ({ ...prev, [u.key]: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                border: '1px solid var(--md-sys-color-outline-variant)',
              }}
            >
              <option value="">割り当てない</option>
              {legacy.questions.map(q => (
                <option key={q.id} value={q.id}>{q.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="p-4 flex items-center justify-between gap-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {assignedCount > 0 ? `${assignedCount}件を割り当てます` : '割り当てる設問を選んでください'}
          {error && <span className="ml-2" style={{ color: '#f87171' }}>{error}</span>}
        </p>
        <Button variant="filled" size="md" loading={saving} disabled={assignedCount === 0} onClick={save}>保存</Button>
      </div>
    </Card>
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
