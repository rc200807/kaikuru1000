'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StatusSelect, type StatusDef, type RecordStatus } from '@/components/linkpartner/StatusSelect'

type Submission = {
  id: string
  formId: string
  createdAt: string
  form: { id: string; title: string; slug: string }
  user: { id: string; name: string } | null
  status: RecordStatus
}
type FormOpt = { id: string; title: string }

export default function LinkPartnerInquiriesPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [forms, setForms] = useState<FormOpt[]>([])
  const [statuses, setStatuses] = useState<StatusDef[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [formId, setFormId] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    p.set('page', String(page))
    if (formId) p.set('formId', formId)
    fetch(`/api/linkpartner/inquiries?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : { submissions: [], total: 0, forms: [], statuses: [] }))
      .then((d) => {
        setSubmissions(d.submissions || [])
        setTotal(d.total || 0)
        setPageSize(d.pageSize || 50)
        setForms(d.forms || [])
        setStatuses(d.statuses || [])
      })
      .finally(() => setLoading(false))
  }, [page, formId])

  useEffect(() => { load() }, [load])

  const onStatusChange = (submissionId: string, next: RecordStatus) => {
    setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? { ...s, status: next } : s)))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">問い合わせ</h1>
          <p className="text-xs text-[#999] mt-1">共有フォームから送信された問い合わせ（{total} 件）</p>
        </div>
        {total > 0 && (
          <a href={`/api/linkpartner/inquiries/export${formId ? `?formId=${encodeURIComponent(formId)}` : ''}`} className="px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm hover:bg-[#222] shrink-0">CSVエクスポート</a>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <select
          value={formId}
          onChange={(e) => { setPage(1); setFormId(e.target.value) }}
          className="px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
        >
          <option value="">すべてのフォーム</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[#999]">読み込み中…</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-[#999] py-12 text-center">該当する問い合わせがありません。</p>
      ) : (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.1fr_1.7fr_1.1fr_1.3fr] gap-3 px-4 py-2.5 text-[11px] text-[#999] bg-[#141414] border-b border-[rgba(255,255,255,0.06)]">
              <span>受信日時</span>
              <span>フォーム</span>
              <span>顧客</span>
              <span>対応ステータス</span>
            </div>
            {submissions.map((s) => (
              <div
                key={s.id}
                onClick={() => router.push(`/linkpartner/inquiries/${s.id}`)}
                className="grid grid-cols-[1.1fr_1.7fr_1.1fr_1.3fr] gap-3 px-4 py-3 text-sm border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[#141414] cursor-pointer items-center"
              >
                <span className="text-[#a3a3a3]">{new Date(s.createdAt).toLocaleString('ja-JP')}</span>
                <span className="truncate">{s.form.title}</span>
                <span className="text-[#a3a3a3] truncate">{s.user?.name ?? '—'}</span>
                <div onClick={(e) => e.stopPropagation()}>
                  <StatusSelect
                    endpoint={`/api/linkpartner/inquiries/${s.id}/status`}
                    statuses={statuses}
                    current={s.status}
                    onChange={(next) => onStatusChange(s.id, next)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] disabled:opacity-40">前へ</button>
          <span className="text-[#999]">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1.5 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] disabled:opacity-40">次へ</button>
        </div>
      )}
    </div>
  )
}
