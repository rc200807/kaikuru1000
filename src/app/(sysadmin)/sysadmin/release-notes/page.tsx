'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import { formatJstDateTime } from '@/lib/datetime'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

type ReleaseNote = {
  id: string
  version: string | null
  title: string
  content: string
  category: string
  targetStore: boolean
  targetAdmin: boolean
  isPublished: boolean
  publishedAt: string | null
  author: { name: string } | null
  readCount: number
  createdAt: string
  updatedAt: string
}

const CATEGORY_OPTIONS = [
  { value: 'feature', label: '新機能', icon: '🚀', color: '#3B82F6' },
  { value: 'improvement', label: '改善', icon: '✨', color: '#10B981' },
  { value: 'fix', label: '修正', icon: '🛠️', color: '#F59E0B' },
  { value: 'notice', label: 'お知らせ', icon: '📣', color: '#8B5CF6' },
] as const

function getCategory(value: string) {
  return CATEGORY_OPTIONS.find(c => c.value === value) ?? CATEGORY_OPTIONS[0]
}

const EMPTY_FORM = {
  version: '',
  title: '',
  content: '',
  category: 'feature' as string,
  targetStore: true,
  targetAdmin: true,
}

export default function SysAdminReleaseNotesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  useEffect(() => {
    if (status === 'authenticated' && role === 'sysadmin') fetchNotes()
  }, [status, role])

  async function fetchNotes() {
    try {
      const res = await fetch('/api/sysadmin/release-notes')
      if (res.ok) setNotes(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(publish: boolean) {
    if (!form.targetStore && !form.targetAdmin) {
      setMessage({ type: 'error', text: '配信先を1つ以上選択してください' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const url = editingId ? `/api/sysadmin/release-notes/${editingId}` : '/api/sysadmin/release-notes'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: form.version.trim() || null,
          title: form.title,
          content: form.content,
          category: form.category,
          targetStore: form.targetStore,
          targetAdmin: form.targetAdmin,
          isPublished: publish,
        }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? '更新しました' : (publish ? '公開しました' : '下書き保存しました') })
        cancelForm()
        fetchNotes()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error || 'エラーが発生しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('このリリースノートを削除しますか？')) return
    const res = await fetch(`/api/sysadmin/release-notes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage({ type: 'success', text: '削除しました' })
      setNotes(prev => prev.filter(n => n.id !== id))
      if (detailId === id) setDetailId(null)
    }
  }

  async function handleTogglePublish(n: ReleaseNote) {
    const res = await fetch(`/api/sysadmin/release-notes/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !n.isPublished }),
    })
    if (res.ok) {
      setMessage({ type: 'success', text: n.isPublished ? '非公開にしました' : '公開しました' })
      fetchNotes()
    }
  }

  function startEdit(n: ReleaseNote) {
    setEditingId(n.id)
    setForm({
      version: n.version ?? '',
      title: n.title,
      content: n.content,
      category: n.category,
      targetStore: n.targetStore,
      targetAdmin: n.targetAdmin,
    })
    setShowForm(true)
    setDetailId(null)
    setMessage(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
  }

  const detailNote = detailId ? notes.find(n => n.id === detailId) : null

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            リリースノート
          </h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            店舗・管理ポータルへ機能追加や変更を告知します
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { setShowForm(true); setMessage(null) }}>
            + 新規作成
          </Button>
        )}
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* 作成/編集フォーム */}
      {showForm && (
        <Card variant="elevated" padding="lg" className="mb-6">
          <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-4">
            {editingId ? 'リリースノートを編集' : '新しいリリースノート'}
          </h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="sm:w-40">
                <TextField
                  label="バージョン（任意）"
                  value={form.version}
                  onChange={v => setForm({ ...form, version: v })}
                  placeholder="v1.4.0"
                />
              </div>
              <div className="flex-1">
                <TextField
                  label="タイトル"
                  value={form.title}
                  onChange={v => setForm({ ...form, title: v })}
                  required
                  placeholder="リリースノートのタイトル"
                />
              </div>
            </div>

            {/* カテゴリ選択 */}
            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                カテゴリ
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setForm({ ...form, category: cat.value })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1 ${
                      form.category === cat.value
                        ? 'text-white ring-2 ring-offset-1 ring-current'
                        : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                    style={form.category === cat.value ? { backgroundColor: cat.color } : undefined}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 配信先 */}
            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                配信先
              </label>
              <div className="flex flex-wrap gap-2">
                <TargetToggle
                  label="🏬 店舗ポータル"
                  active={form.targetStore}
                  onClick={() => setForm({ ...form, targetStore: !form.targetStore })}
                />
                <TargetToggle
                  label="🛡️ 管理ポータル"
                  active={form.targetAdmin}
                  onClick={() => setForm({ ...form, targetAdmin: !form.targetAdmin })}
                />
              </div>
            </div>

            {/* 本文 */}
            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                本文
              </label>
              <RichTextEditor
                content={form.content}
                onChange={(html) => setForm({ ...form, content: html })}
                placeholder="変更内容を入力してください..."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleSubmit(true)}
                disabled={submitting || !form.title.trim() || !form.content.trim()}
                loading={submitting}
              >
                {editingId ? '更新して公開' : '公開する'}
              </Button>
              <Button
                variant="tonal"
                onClick={() => handleSubmit(false)}
                disabled={submitting || !form.title.trim() || !form.content.trim()}
              >
                下書き保存
              </Button>
              <Button variant="text" onClick={cancelForm}>
                キャンセル
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 詳細プレビュー */}
      {detailNote && !showForm && (
        <Card variant="elevated" padding="lg" className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CategoryChip category={detailNote.category} />
                {detailNote.version && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                    {detailNote.version}
                  </span>
                )}
                {detailNote.isPublished ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">公開中</span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">下書き</span>
                )}
                <TargetBadges targetStore={detailNote.targetStore} targetAdmin={detailNote.targetAdmin} />
              </div>
              <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">{detailNote.title}</h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {detailNote.author?.name ?? '運営'} · {formatJstDateTime(detailNote.createdAt)}
              </p>
            </div>
            <button
              onClick={() => setDetailId(null)}
              className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-[var(--md-sys-color-on-surface)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: detailNote.content }}
          />
          <div className="flex gap-2 mt-6 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
            <Button size="sm" onClick={() => startEdit(detailNote)}>編集</Button>
            <Button size="sm" variant="tonal" onClick={() => handleTogglePublish(detailNote)}>
              {detailNote.isPublished ? '非公開にする' : '公開する'}
            </Button>
            <Button size="sm" variant="text" onClick={() => handleDelete(detailNote.id)}>削除</Button>
          </div>
        </Card>
      )}

      {/* 一覧 */}
      {notes.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
            </svg>
          }
          title="リリースノートがありません"
          description="「新規作成」から機能追加やアップデートを告知しましょう"
        />
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => { setDetailId(n.id); setShowForm(false) }}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors border ${
                detailId === n.id
                  ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-container)]/20'
                  : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CategoryChip category={n.category} />
                {n.version && (
                  <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">{n.version}</span>
                )}
                {n.isPublished ? (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">公開中</span>
                ) : (
                  <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">下書き</span>
                )}
                <TargetBadges targetStore={n.targetStore} targetAdmin={n.targetAdmin} />
                {n.isPublished && (
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">既読 {n.readCount}</span>
                )}
                <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto">
                  {formatJstDateTime(n.createdAt, { year: undefined, month: 'numeric', day: 'numeric' })}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-1">{n.title}</h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 mt-0.5">
                {n.content.replace(/<[^>]*>/g, '')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TargetToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1.5 border ${
        active
          ? 'bg-[var(--admin-primary)]/15 text-[var(--md-sys-color-on-surface)] border-[var(--admin-primary)]'
          : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-transparent hover:bg-[var(--md-sys-color-surface-container-high)]'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${active ? 'bg-[var(--admin-primary)] border-[var(--admin-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
        {active && (
          <svg className="w-2.5 h-2.5 text-[var(--md-sys-color-surface)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
        )}
      </span>
      {label}
    </button>
  )
}

function CategoryChip({ category }: { category: string }) {
  const c = getCategory(category)
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: c.color }}
    >
      {c.icon} {c.label}
    </span>
  )
}

function TargetBadges({ targetStore, targetAdmin }: { targetStore: boolean; targetAdmin: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {targetStore && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">🏬 店舗</span>
      )}
      {targetAdmin && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">🛡️ 管理</span>
      )}
    </span>
  )
}
