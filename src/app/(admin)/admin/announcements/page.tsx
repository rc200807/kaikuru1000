'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type Announcement = {
  id: string
  title: string
  content: string
  category: string
  isPublished: boolean
  publishedAt: string | null
  adminId: string
  admin: { name: string }
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'general', label: '一般', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'important', label: '重要', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { value: 'system', label: 'システム', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'campaign', label: 'キャンペーン', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
]

function getCategoryInfo(value: string) {
  return CATEGORIES.find(c => c.value === value) || CATEGORIES[0]
}

export default function AdminAnnouncementsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', category: 'general' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // 詳細表示用
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchAnnouncements()
  }, [status])

  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/admin/announcements')
      if (res.ok) setAnnouncements(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(publish: boolean) {
    setSubmitting(true)
    setMessage(null)
    try {
      const url = editingId ? `/api/admin/announcements/${editingId}` : '/api/admin/announcements'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, isPublished: publish }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? '更新しました' : (publish ? '公開しました' : '下書き保存しました') })
        setShowForm(false)
        setEditingId(null)
        setForm({ title: '', content: '', category: 'general' })
        fetchAnnouncements()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'エラーが発生しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('このお知らせを削除しますか？')) return
    const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage({ type: 'success', text: '削除しました' })
      setAnnouncements(prev => prev.filter(a => a.id !== id))
      if (detailId === id) setDetailId(null)
    }
  }

  async function handleTogglePublish(a: Announcement) {
    const res = await fetch(`/api/admin/announcements/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !a.isPublished }),
    })
    if (res.ok) {
      setMessage({ type: 'success', text: a.isPublished ? '非公開にしました' : '公開しました' })
      fetchAnnouncements()
    }
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id)
    setForm({ title: a.title, content: a.content, category: a.category })
    setShowForm(true)
    setDetailId(null)
    setMessage(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ title: '', content: '', category: 'general' })
  }

  const detailAnnouncement = detailId ? announcements.find(a => a.id === detailId) : null

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
            お知らせ管理
          </h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            店舗向けのお知らせを作成・管理します
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
            {editingId ? 'お知らせを編集' : '新しいお知らせ'}
          </h2>
          <div className="space-y-4">
            <TextField
              label="タイトル"
              value={form.title}
              onChange={v => setForm({ ...form, title: v })}
              required
              placeholder="お知らせのタイトル"
            />

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                カテゴリ
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setForm({ ...form, category: cat.value })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      form.category === cat.value
                        ? cat.color + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                本文
              </label>
              <textarea
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                rows={10}
                placeholder="お知らせの本文を入力してください..."
                className="w-full px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] focus:border-[var(--admin-primary)] focus:ring-1 focus:ring-[var(--admin-primary)] outline-none transition-colors text-sm"
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
      {detailAnnouncement && !showForm && (
        <Card variant="elevated" padding="lg" className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryInfo(detailAnnouncement.category).color}`}>
                  {getCategoryInfo(detailAnnouncement.category).label}
                </span>
                {!detailAnnouncement.isPublished && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                    下書き
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                {detailAnnouncement.title}
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {detailAnnouncement.admin.name} · {format(new Date(detailAnnouncement.createdAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
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
          <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap leading-relaxed">
            {detailAnnouncement.content}
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
            <Button size="sm" onClick={() => startEdit(detailAnnouncement)}>編集</Button>
            <Button size="sm" variant="tonal" onClick={() => handleTogglePublish(detailAnnouncement)}>
              {detailAnnouncement.isPublished ? '非公開にする' : '公開する'}
            </Button>
            <Button size="sm" variant="text" onClick={() => handleDelete(detailAnnouncement.id)}>
              削除
            </Button>
          </div>
        </Card>
      )}

      {/* お知らせ一覧 */}
      {announcements.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          }
          title="お知らせがありません"
          description="「新規作成」からお知らせを作成しましょう"
        />
      ) : (
        <div className="space-y-2">
          {announcements.map(a => {
            const catInfo = getCategoryInfo(a.category)
            return (
              <button
                key={a.id}
                onClick={() => { setDetailId(a.id); setShowForm(false) }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors border ${
                  detailId === a.id
                    ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-container)]/20'
                    : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catInfo.color}`}>
                    {catInfo.label}
                  </span>
                  {a.isPublished ? (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">公開中</span>
                  ) : (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">下書き</span>
                  )}
                  <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto">
                    {format(new Date(a.createdAt), 'M/d HH:mm', { locale: ja })}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                  {a.title}
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 mt-0.5">
                  {a.content}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
