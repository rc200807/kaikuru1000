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
import Modal from '@/components/Modal'

type AnnouncementCategory = {
  id: string
  name: string
  color: string
  icon: string
  sortOrder: number
  _count: { announcements: number }
}

type Announcement = {
  id: string
  title: string
  content: string
  priority: string
  categoryId: string | null
  announcementCategory: { id: string; name: string; color: string; icon: string } | null
  isPublished: boolean
  publishedAt: string | null
  adminId: string
  admin: { name: string }
  readCount: number
  totalStores: number
  createdAt: string
  updatedAt: string
}

const PRIORITY_OPTIONS = [
  { value: 'normal', label: '通常', color: '' },
  { value: 'high', label: '重要', color: 'border-orange-400 dark:border-orange-500' },
  { value: 'urgent', label: '緊急', color: 'border-red-500 dark:border-red-500' },
]

const DEFAULT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#6B7280',
]

const DEFAULT_ICONS = ['📢', '📣', '🔔', '⚡', '🎉', '🛠️', '📋', '💡', '🚀', '⚠️']

function getPriorityInfo(priority: string) {
  return PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[0]
}

export default function AdminAnnouncementsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'announcements' | 'categories'>('announcements')

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', categoryId: '', priority: 'normal' })
  const [submitting, setSubmitting] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Categories
  const [categories, setCategories] = useState<AnnouncementCategory[]>([])
  const [showCatForm, setShowCatForm] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [catForm, setCatForm] = useState({ name: '', color: '#3B82F6', icon: '📢' })
  const [catSubmitting, setCatSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAnnouncements()
      fetchCategories()
    }
  }, [status])

  // === Announcements ===

  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/admin/announcements')
      if (res.ok) setAnnouncements(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch('/api/admin/announcement-categories')
      if (res.ok) setCategories(await res.json())
    } catch { /* ignore */ }
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
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          categoryId: form.categoryId || null,
          priority: form.priority,
          isPublished: publish,
        }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? '更新しました' : (publish ? '公開しました' : '下書き保存しました') })
        setShowForm(false)
        setEditingId(null)
        setForm({ title: '', content: '', categoryId: '', priority: 'normal' })
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
    setForm({
      title: a.title,
      content: a.content,
      categoryId: a.categoryId || '',
      priority: a.priority || 'normal',
    })
    setShowForm(true)
    setDetailId(null)
    setMessage(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ title: '', content: '', categoryId: '', priority: 'normal' })
  }

  // === Categories ===

  async function handleCatSubmit() {
    if (!catForm.name.trim()) return
    setCatSubmitting(true)
    setMessage(null)
    try {
      const url = editingCatId
        ? `/api/admin/announcement-categories/${editingCatId}`
        : '/api/admin/announcement-categories'
      const method = editingCatId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catForm),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingCatId ? 'カテゴリを更新しました' : 'カテゴリを作成しました' })
        setShowCatForm(false)
        setEditingCatId(null)
        setCatForm({ name: '', color: '#3B82F6', icon: '📢' })
        fetchCategories()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'エラーが発生しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' })
    } finally {
      setCatSubmitting(false)
    }
  }

  async function handleDeleteCat(id: string) {
    if (!confirm('このカテゴリを削除しますか？関連するお知らせのカテゴリは未設定になります。')) return
    const res = await fetch(`/api/admin/announcement-categories/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage({ type: 'success', text: 'カテゴリを削除しました' })
      fetchCategories()
      fetchAnnouncements()
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
    }
  }

  function startEditCat(cat: AnnouncementCategory) {
    setEditingCatId(cat.id)
    setCatForm({ name: cat.name, color: cat.color, icon: cat.icon })
    setShowCatForm(true)
  }

  // === Derived ===

  const detailAnnouncement = detailId ? announcements.find(a => a.id === detailId) : null

  function getCategoryDisplay(a: Announcement) {
    if (a.announcementCategory) {
      return { name: a.announcementCategory.name, color: a.announcementCategory.color, icon: a.announcementCategory.icon }
    }
    return null
  }

  function getListBorderClass(a: Announcement) {
    if (a.priority === 'urgent') return 'border-red-500 dark:border-red-500 border-l-4'
    if (a.priority === 'high') return 'border-orange-400 dark:border-orange-500 border-l-4'
    return 'border-[var(--md-sys-color-outline-variant)]'
  }

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
        {activeTab === 'announcements' && !showForm && (
          <Button onClick={() => { setShowForm(true); setMessage(null) }}>
            + 新規作成
          </Button>
        )}
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 bg-[var(--md-sys-color-surface-container)] rounded-xl p-1 mb-6">
        {(['announcements', 'categories'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              setShowForm(false)
              setShowCatForm(false)
              setDetailId(null)
              setMessage(null)
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab
                ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {tab === 'announcements' ? `お知らせ (${announcements.length})` : `カテゴリ (${categories.length})`}
          </button>
        ))}
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

      {/* ========== カテゴリタブ ========== */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {!showCatForm && (
              <Button size="sm" onClick={() => { setShowCatForm(true); setCatForm({ name: '', color: '#3B82F6', icon: '📢' }); setEditingCatId(null) }}>
                + カテゴリ追加
              </Button>
            )}
          </div>

          {showCatForm && (
            <Card variant="elevated" padding="md" className="mb-4">
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">
                {editingCatId ? 'カテゴリ編集' : '新しいカテゴリ'}
              </h3>
              <div className="space-y-4">
                <TextField
                  label="カテゴリ名"
                  value={catForm.name}
                  onChange={v => setCatForm({ ...catForm, name: v })}
                  placeholder="例: 一般、重要、キャンペーン"
                  required
                />

                {/* アイコン選択 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                    アイコン
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_ICONS.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setCatForm({ ...catForm, icon })}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-all ${
                          catForm.icon === icon
                            ? 'bg-[var(--admin-primary-container)] ring-2 ring-[var(--admin-primary)]'
                            : 'bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* カラー選択 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                    カラー
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCatForm({ ...catForm, color })}
                        className={`w-8 h-8 rounded-full transition-all ${
                          catForm.color === color ? 'ring-2 ring-offset-2 ring-[var(--admin-primary)]' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* プレビュー */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                    プレビュー
                  </label>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: catForm.color }}
                  >
                    {catForm.icon} {catForm.name || 'カテゴリ名'}
                  </span>
                </div>

                <div className="flex gap-3">
                  <Button onClick={handleCatSubmit} disabled={catSubmitting || !catForm.name.trim()} loading={catSubmitting}>
                    {editingCatId ? '更新' : '作成'}
                  </Button>
                  <Button variant="text" onClick={() => { setShowCatForm(false); setEditingCatId(null) }}>
                    キャンセル
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {categories.length === 0 ? (
            <EmptyState
              icon={
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              }
              title="カテゴリがありません"
              description="お知らせを分類するためにカテゴリを作成してください"
            />
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: cat.color }}
                    >
                      {cat.icon} {cat.name}
                    </span>
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {cat._count.announcements}件のお知らせ
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditCat(cat)}
                      className="text-xs text-[var(--admin-primary)] hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDeleteCat(cat.id)}
                      className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== お知らせタブ ========== */}
      {activeTab === 'announcements' && (
        <>
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

                {/* カテゴリ選択 (DBカテゴリ) */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                    カテゴリ
                  </label>
                  {categories.length === 0 ? (
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      カテゴリタブからカテゴリを作成してください
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, categoryId: '' })}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          !form.categoryId
                            ? 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] ring-2 ring-offset-1 ring-[var(--admin-primary)]'
                            : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        未設定
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setForm({ ...form, categoryId: cat.id })}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1 ${
                            form.categoryId === cat.id
                              ? 'text-white ring-2 ring-offset-1 ring-current'
                              : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                          }`}
                          style={form.categoryId === cat.id ? { backgroundColor: cat.color } : undefined}
                        >
                          {cat.icon} {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 重要度選択 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">
                    重要度
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm({ ...form, priority: opt.value })}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          form.priority === opt.value
                            ? opt.value === 'urgent'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 ring-2 ring-offset-1 ring-red-500'
                              : opt.value === 'high'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 ring-2 ring-offset-1 ring-orange-400'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 ring-2 ring-offset-1 ring-blue-400'
                            : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        {opt.value === 'urgent' && '🔴 '}
                        {opt.label}
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
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {detailAnnouncement.announcementCategory && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: detailAnnouncement.announcementCategory.color }}
                      >
                        {detailAnnouncement.announcementCategory.icon} {detailAnnouncement.announcementCategory.name}
                      </span>
                    )}
                    {detailAnnouncement.priority === 'urgent' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                        🔴 緊急
                      </span>
                    )}
                    {detailAnnouncement.priority === 'high' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                        重要
                      </span>
                    )}
                    {!detailAnnouncement.isPublished && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                        下書き
                      </span>
                    )}
                    {/* 既読状況 */}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                      既読 {detailAnnouncement.readCount} / {detailAnnouncement.totalStores} 店舗
                    </span>
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
                const catDisplay = getCategoryDisplay(a)
                const priorityInfo = getPriorityInfo(a.priority)
                return (
                  <button
                    key={a.id}
                    onClick={() => { setDetailId(a.id); setShowForm(false) }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors border ${
                      detailId === a.id
                        ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-container)]/20'
                        : `${getListBorderClass(a)} bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)]`
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.priority === 'urgent' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                          🔴 緊急
                        </span>
                      )}
                      {a.priority === 'high' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                          重要
                        </span>
                      )}
                      {catDisplay && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: catDisplay.color }}
                        >
                          {catDisplay.icon} {catDisplay.name}
                        </span>
                      )}
                      {a.isPublished ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">公開中</span>
                      ) : (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">下書き</span>
                      )}
                      {/* 既読状況 */}
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        既読 {a.readCount}/{a.totalStores}
                      </span>
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
        </>
      )}
    </div>
  )
}
