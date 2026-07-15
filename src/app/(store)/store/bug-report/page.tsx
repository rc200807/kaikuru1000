'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type Comment = {
  id: string
  authorType: 'store' | 'admin'
  authorName: string | null
  body: string
  imageUrls: string
  createdAt: string
}

type BugReport = {
  id: string
  title: string
  category: string
  details: string
  imageUrls: string
  status: string
  reporterName: string | null
  comments: Comment[]
  createdAt: string
  updatedAt: string
}

const STATUS_LABEL: Record<string, string> = { open: '未対応', in_progress: '対応中', resolved: '解決' }
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  open:        { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  in_progress: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  resolved:    { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
}
const CATEGORY_LABEL: Record<string, string> = {
  system: 'システム不具合',
  ui: 'UI/表示の問題',
  operation: 'オペレーション',
  other: 'その他',
}

function parseUrls(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function uploadImageFiles(files: File[]): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `${file.name} のアップロードに失敗しました`)
    }
    const data = await res.json()
    urls.push(data.url)
  }
  return urls
}

/** 画像添付ボタン（分かりやすいボタン＋サムネイルプレビュー＋個別削除） */
function ImageAttachButton({
  inputRef,
  images,
  setImages,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  images: File[]
  setImages: (v: File[]) => void
}) {
  const previews = useMemo(() => images.map(f => URL.createObjectURL(f)), [images])
  useEffect(() => () => { previews.forEach(url => URL.revokeObjectURL(url)) }, [previews])

  return (
    <div>
      <input
        ref={inputRef} type="file" accept="image/*" multiple
        onChange={e => setImages(Array.from(e.target.files || []))}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline)', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 14.25v4.5m0 0v4.5m0-4.5h4.5m-4.5 0H13.5M3.75 19.5h9.75a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
        </svg>
        {images.length > 0 ? `画像を選び直す（${images.length}枚）` : '画像を追加'}
      </button>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {previews.map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 68, height: 68, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--md-sys-color-outline-variant)' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                aria-label="この画像を削除"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, lineHeight: '20px', textAlign: 'center', cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StoreBugReportPage() {
  const { status } = useSession()
  const router = useRouter()

  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // 新規作成フォーム
  const [form, setForm] = useState({ title: '', category: 'system', details: '', reporterName: '' })
  const [formImages, setFormImages] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // コメント入力
  const [commentBody, setCommentBody] = useState('')
  const [commentImages, setCommentImages] = useState<File[]>([])
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const commentFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchReports()
  }, [status])

  function fetchReports() {
    setLoading(true)
    fetch('/api/store/bug-reports')
      .then(r => r.ok ? r.json() : [])
      .then((d: BugReport[]) => setReports(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  const selected = useMemo(() => reports.find(r => r.id === selectedId) ?? null, [reports, selectedId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setFormError(null)
    if (!form.title.trim() || !form.details.trim()) {
      setFormError('件名と詳細は必須です')
      return
    }
    setSubmitting(true)
    try {
      const imageUrls = formImages.length > 0 ? await uploadImageFiles(formImages) : []
      const res = await fetch('/api/store/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          details: form.details.trim(),
          reporterName: form.reporterName.trim() || null,
          imageUrls,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送信に失敗しました')
      }
      setForm({ title: '', category: 'system', details: '', reporterName: '' })
      setFormImages([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      setCreateOpen(false)
      fetchReports()
    } catch (e: any) {
      setFormError(e?.message || '送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || commentSubmitting) return
    if (!commentBody.trim()) return
    setCommentSubmitting(true)
    try {
      const imageUrls = commentImages.length > 0 ? await uploadImageFiles(commentImages) : []
      const res = await fetch(`/api/store/bug-reports/${selected.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim(), imageUrls }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'コメント送信に失敗しました')
      }
      setCommentBody('')
      setCommentImages([])
      if (commentFileRef.current) commentFileRef.current.value = ''
      fetchReports()
    } catch (e: any) {
      alert(e?.message || 'コメント送信に失敗しました')
    } finally {
      setCommentSubmitting(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>不具合報告</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
            運営に不具合・改善要望を報告できます（{reports.length}件）
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          ＋ 新規報告
        </button>
      </div>

      {/* 新規報告モーダル */}
      {createOpen && (
        <div
          onClick={() => !submitting && setCreateOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 20, maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>不具合報告を新規作成</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                件名 <span style={{ color: '#f87171' }}>*</span>
                <input
                  type="text" required value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="例: 顧客一覧の検索が機能しない"
                  style={{ marginTop: 4, width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 14 }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                種別 <span style={{ color: '#f87171' }}>*</span>
                <select
                  value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  style={{ marginTop: 4, width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 14 }}
                >
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                報告者名（任意）
                <input
                  type="text" value={form.reporterName}
                  onChange={e => setForm({ ...form, reporterName: e.target.value })}
                  placeholder="記入者の名前"
                  style={{ marginTop: 4, width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 14 }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                詳細 <span style={{ color: '#f87171' }}>*</span>
                <textarea
                  required value={form.details} rows={6}
                  onChange={e => setForm({ ...form, details: e.target.value })}
                  placeholder="発生した状況、再現手順、期待する動作などを記入してください"
                  style={{ marginTop: 4, width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                <span>画像（任意・複数可・各10MB以下）</span>
                <div style={{ marginTop: 6 }}>
                  <ImageAttachButton inputRef={fileInputRef} images={formImages} setImages={setFormImages} />
                </div>
              </div>
              {formError && (
                <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button" disabled={submitting}
                  onClick={() => setCreateOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: submitting ? 'wait' : 'pointer' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit" disabled={submitting}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? '送信中...' : '送信'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 分割レイアウト */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', overflow: 'hidden' }}>
        {/* 左ペイン: 一覧 */}
        <aside style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {reports.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>まだ報告はありません</p>
            ) : (
              reports.map(r => {
                const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR.open
                const isSel = r.id === selectedId
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: isSel ? 'var(--md-sys-color-surface-container-high)' : 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: sc.bg, color: sc.fg, fontWeight: 600 }}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>{CATEGORY_LABEL[r.category] ?? r.category}・コメント {r.comments.length}</div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* 右ペイン: 詳細 */}
        <main style={{ overflowY: 'auto', padding: '20px 24px' }}>
          {!selected ? (
            <p style={{ textAlign: 'center', marginTop: 80, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>左の一覧から報告を選択してください</p>
          ) : (
            <ReportDetail
              report={selected}
              commentBody={commentBody}
              setCommentBody={setCommentBody}
              commentImages={commentImages}
              setCommentImages={setCommentImages}
              commentSubmitting={commentSubmitting}
              commentFileRef={commentFileRef}
              onAddComment={handleAddComment}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function ReportDetail({
  report, commentBody, setCommentBody, commentImages, setCommentImages, commentSubmitting, commentFileRef, onAddComment,
}: {
  report: BugReport
  commentBody: string
  setCommentBody: (v: string) => void
  commentImages: File[]
  setCommentImages: (v: File[]) => void
  commentSubmitting: boolean
  commentFileRef: React.RefObject<HTMLInputElement | null>
  onAddComment: (e: React.FormEvent) => void
}) {
  const images = parseUrls(report.imageUrls)
  const sc = STATUS_COLOR[report.status] ?? STATUS_COLOR.open
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{report.title}</h2>
          <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {CATEGORY_LABEL[report.category] ?? report.category} ・ {new Date(report.createdAt).toLocaleString('ja-JP')}
            {report.reporterName ? ` ・ 報告者: ${report.reporterName}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, background: sc.bg, color: sc.fg, fontWeight: 600 }}>
          {STATUS_LABEL[report.status] ?? report.status}
        </span>
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container)', borderRadius: 10, padding: 14, marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
        {report.details}
      </div>

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt={`添付${i + 1}`} style={{ maxWidth: 180, maxHeight: 140, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
            </a>
          ))}
        </div>
      )}

      <h3 style={{ margin: '20px 0 8px', fontSize: 14, fontWeight: 700 }}>やりとり</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {report.comments.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>まだコメントはありません</p>
        ) : (
          report.comments.map(c => {
            const isAdmin = c.authorType === 'admin'
            const cImages = parseUrls(c.imageUrls)
            return (
              <div key={c.id} style={{ alignSelf: isAdmin ? 'flex-start' : 'flex-end', maxWidth: '80%', background: isAdmin ? 'var(--md-sys-color-surface-container-high)' : 'rgba(96,165,250,0.12)', borderRadius: 10, padding: 10, fontSize: 13 }}>
                <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>
                  {isAdmin ? '🛠 運営' : '🏪 店舗'}{c.authorName ? ` ・ ${c.authorName}` : ''} ・ {new Date(c.createdAt).toLocaleString('ja-JP')}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.body}</div>
                {cImages.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {cImages.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {report.status !== 'resolved' && (
        <form onSubmit={onAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={commentBody} onChange={e => setCommentBody(e.target.value)}
            placeholder="運営への追加情報・返信を入力..." rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <ImageAttachButton inputRef={commentFileRef} images={commentImages} setImages={setCommentImages} />
            <button
              type="submit" disabled={commentSubmitting || !commentBody.trim()}
              style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: commentSubmitting ? 'wait' : 'pointer', opacity: (commentSubmitting || !commentBody.trim()) ? 0.6 : 1 }}
            >
              {commentSubmitting ? '送信中...' : '送信'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
