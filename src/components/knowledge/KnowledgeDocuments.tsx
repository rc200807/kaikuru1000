'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { upload } from '@vercel/blob/client'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import { FAQ_VISIBILITIES, knowledgeDocumentStatusLabel } from '@/lib/knowledge'

type Document = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  visibility: string
  status: string
  errorMessage: string | null
  attempts: number
  createdAt: string
  updatedAt: string
  uploadedBy: { id: string; name: string } | null
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  pending:    { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  processing: { bg: 'rgba(59,130,246,0.15)',  fg: '#3b82f6' },
  ready:      { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
  error:      { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
}

function StatusBadge({ value }: { value: string }) {
  const c = STATUS_COLOR[value] ?? STATUS_COLOR.pending
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {knowledgeDocumentStatusLabel(value)}
    </span>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const selectCls =
  'h-8 px-2 text-xs bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2'

export default function KnowledgeDocuments() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleting, setDeleting] = useState<Document | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(() => fetch('/api/admin/knowledge/documents')
    .then(r => (r.ok ? r.json() : []))
    .then(d => setDocuments(Array.isArray(d) ? d : [])), [])

  useEffect(() => { loadDocuments().finally(() => setLoading(false)) }, [loadDocuments])

  // 解析中の資料があれば8秒ごとにポーリングして更新（録音のAI解析と同じ流儀）
  useEffect(() => {
    const busy = documents.some(d => d.status === 'pending' || d.status === 'processing')
    if (!busy) return
    const t = setInterval(loadDocuments, 8000)
    return () => clearInterval(t)
  }, [documents, loadDocuments])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') {
      setMessage({ type: 'error', text: 'PDFファイルのみアップロードできます' })
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'ファイルは50MB以下にしてください' })
      return
    }
    setMessage(null)
    setUploading(true)
    setProgress(0)
    try {
      const pathname = `knowledge-documents/${Date.now()}-${file.name}`
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/knowledge/documents/upload',
        contentType: file.type,
        onUploadProgress: p => setProgress(Math.round(p.percentage)),
      })
      const res = await fetch('/api/admin/knowledge/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: blob.url, fileName: file.name, mimeType: file.type, fileSize: file.size,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || '登録に失敗しました') }
      await loadDocuments()
      setMessage({ type: 'success', text: '資料をアップロードしました。AIによる解析が完了すると情報源として使えるようになります。' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'アップロードに失敗しました' })
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function patchDocument(id: string, data: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/admin/knowledge/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: j.error || '更新に失敗しました' })
      return false
    }
    await loadDocuments()
    return true
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/admin/knowledge/documents/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || '削除に失敗しました') }
      setDeleting(null)
      await loadDocuments()
      setMessage({ type: 'success', text: '資料を削除しました' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '削除に失敗しました' })
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-6 text-center">読み込み中...</p>

  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
        PDFをアップロードすると、AIが内容をテキスト化してFAQと同じようにAIチャットの情報源にします（対応形式: PDF・50MBまで）。
        解析には数十秒かかることがあります。
      </p>

      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <div className="flex items-center gap-3">
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} className="hidden" id="kb-doc-upload" />
        <Button
          size="sm"
          loading={uploading}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          PDFをアップロード
        </Button>
        {uploading && (
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">アップロード中... {progress}%</span>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-10 text-center">
          資料がまだ登録されていません
        </p>
      ) : (
        <div className="space-y-1">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 py-2.5 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)]"
            >
              <svg className="w-5 h-5 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>

              <div className="flex-1 min-w-0">
                {editingId === doc.id ? (
                  <form
                    onSubmit={async e => {
                      e.preventDefault()
                      if (!editTitle.trim()) return
                      if (await patchDocument(doc.id, { title: editTitle.trim() })) setEditingId(null)
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                      className="w-full h-8 px-2 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                    />
                    <Button size="sm" type="submit">保存</Button>
                    <Button size="sm" variant="text" onClick={() => setEditingId(null)}>取消</Button>
                  </form>
                ) : (
                  <button
                    onClick={() => { setEditingId(doc.id); setEditTitle(doc.title) }}
                    className="text-left text-sm text-[var(--md-sys-color-on-surface)] hover:underline truncate block max-w-full"
                    title="クリックでタイトルを編集"
                  >
                    {doc.title}
                  </button>
                )}
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                  {doc.fileName} ・ {formatSize(doc.fileSize)}
                  {doc.uploadedBy && <> ・ {doc.uploadedBy.name}</>}
                  {doc.status === 'error' && doc.errorMessage && <> ・ {doc.errorMessage}</>}
                </p>
              </div>

              <StatusBadge value={doc.status} />

              <select
                value={doc.visibility}
                onChange={e => patchDocument(doc.id, { visibility: e.target.value })}
                className={selectCls}
              >
                {FAQ_VISIBILITIES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>

              <button
                onClick={() => setDeleting(doc)}
                className="text-xs text-[var(--md-sys-color-error)] px-2 flex-shrink-0 hover:underline"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleteBusy && setDeleting(null)}>
          <div
            className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] p-5 max-w-sm w-full space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">
              「{deleting.title}」を削除しますか？AIチャットの情報源からも除外されます。
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="text" onClick={() => setDeleting(null)} disabled={deleteBusy}>キャンセル</Button>
              <Button size="sm" variant="filled" onClick={handleDelete} loading={deleteBusy} disabled={deleteBusy}>削除する</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
