'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
import { appendImageToFormData } from '@/lib/image-utils'

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
  storeId: string
  store: { id: string; name: string; code: string }
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
    // 原本をそのまま送らず、リサイズ＋WebP圧縮してから送る
    await appendImageToFormData(fd, 'file', file)
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

export default function AdminBugReportsPage() {
  const { status } = useSession()
  const router = useRouter()

  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // フィルタ
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [storeFilter, setStoreFilter] = useState('')

  const [commentBody, setCommentBody] = useState('')
  const [commentImages, setCommentImages] = useState<File[]>([])
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const commentFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchReports()
  }, [status])

  function fetchReports() {
    setLoading(true)
    fetch('/api/admin/bug-reports')
      .then(r => r.ok ? r.json() : [])
      .then((d: BugReport[]) => setReports(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  const stores = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    reports.forEach(r => map.set(r.store.id, { id: r.store.id, name: r.store.name }))
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [reports])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return reports.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false
      if (categoryFilter && r.category !== categoryFilter) return false
      if (storeFilter && r.storeId !== storeFilter) return false
      if (q) {
        const hay = [r.title, r.details, r.store.name, r.reporterName ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [reports, searchText, statusFilter, categoryFilter, storeFilter])

  const selected = useMemo(() => reports.find(r => r.id === selectedId) ?? null, [reports, selectedId])

  async function updateStatus(reportId: string, newStatus: string) {
    const res = await fetch(`/api/admin/bug-reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) return
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r))
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || commentSubmitting || !commentBody.trim()) return
    setCommentSubmitting(true)
    try {
      const imageUrls = commentImages.length > 0 ? await uploadImageFiles(commentImages) : []
      const res = await fetch(`/api/admin/bug-reports/${selected.id}/comments`, {
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
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>不具合報告</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          全店舗から受け付けた不具合・改善要望（{filtered.length}件 / 全{reports.length}件）
        </p>
      </div>

      {/* 分割レイアウト */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', overflow: 'hidden' }}>
        {/* 左ペイン: フィルタ + 一覧 */}
        <aside style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="検索（件名・詳細・店舗）"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <StoreFilterSelect value={storeFilter} onChange={setStoreFilter} stores={stores} style={{ flex: 1 }} />
              <select
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ flex: '0 0 100px', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
              >
                <option value="">全状態</option>
                <option value="open">未対応</option>
                <option value="in_progress">対応中</option>
                <option value="resolved">解決</option>
              </select>
            </div>
            <select
              value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
            >
              <option value="">すべての種別</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当する報告がありません</p>
            ) : (
              filtered.map(r => {
                const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR.open
                const isSel = r.id === selectedId
                return (
                  <button
                    key={r.id} onClick={() => setSelectedId(r.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: isSel ? 'var(--md-sys-color-surface-container-high)' : 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.store.name}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: sc.bg, color: sc.fg, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>
                      {CATEGORY_LABEL[r.category] ?? r.category} ・ {new Date(r.createdAt).toLocaleDateString('ja-JP')} ・ コメント {r.comments.length}
                    </div>
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
            <AdminReportDetail
              report={selected}
              onStatusChange={(s) => updateStatus(selected.id, s)}
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

function AdminReportDetail({
  report, onStatusChange, commentBody, setCommentBody, commentImages, setCommentImages, commentSubmitting, commentFileRef, onAddComment,
}: {
  report: BugReport
  onStatusChange: (s: string) => void
  commentBody: string
  setCommentBody: (v: string) => void
  commentImages: File[]
  setCommentImages: (v: File[]) => void
  commentSubmitting: boolean
  commentFileRef: React.RefObject<HTMLInputElement | null>
  onAddComment: (e: React.FormEvent) => void
}) {
  const images = parseUrls(report.imageUrls)
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{report.title}</h2>
          <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {report.store.name} ・ {CATEGORY_LABEL[report.category] ?? report.category} ・ {new Date(report.createdAt).toLocaleString('ja-JP')}
            {report.reporterName ? ` ・ 報告者: ${report.reporterName}` : ''}
          </div>
        </div>
        <select
          value={report.status} onChange={e => onStatusChange(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600 }}
        >
          <option value="open">未対応</option>
          <option value="in_progress">対応中</option>
          <option value="resolved">解決</option>
        </select>
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container)', borderRadius: 10, padding: 14, marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
        {report.details}
      </div>

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img loading="lazy" decoding="async" src={url} alt={`添付${i + 1}`} style={{ maxWidth: 200, maxHeight: 160, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
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
              <div key={c.id} style={{ alignSelf: isAdmin ? 'flex-end' : 'flex-start', maxWidth: '80%', background: isAdmin ? 'rgba(96,165,250,0.12)' : 'var(--md-sys-color-surface-container-high)', borderRadius: 10, padding: 10, fontSize: 13 }}>
                <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>
                  {isAdmin ? '🛠 運営' : '🏪 店舗'}{c.authorName ? ` ・ ${c.authorName}` : ''} ・ {new Date(c.createdAt).toLocaleString('ja-JP')}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.body}</div>
                {cImages.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {cImages.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img loading="lazy" decoding="async" src={url} alt="" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <form onSubmit={onAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={commentBody} onChange={e => setCommentBody(e.target.value)}
          placeholder="店舗への返信・対応状況を入力..." rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={commentFileRef} type="file" accept="image/*" multiple
            onChange={e => setCommentImages(Array.from(e.target.files || []))}
            style={{ fontSize: 12 }}
          />
          <button
            type="submit" disabled={commentSubmitting || !commentBody.trim()}
            style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: commentSubmitting ? 'wait' : 'pointer', opacity: (commentSubmitting || !commentBody.trim()) ? 0.6 : 1 }}
          >
            {commentSubmitting ? '送信中...' : '送信'}
          </button>
        </div>
      </form>
    </div>
  )
}
