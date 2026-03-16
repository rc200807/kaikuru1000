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
import { getYoutubeEmbedUrl, getYoutubeThumbnail } from '@/lib/youtube-utils'

type VideoCategory = {
  id: string
  name: string
  sortOrder: number
  _count: { videos: number }
}

type TrainingVideo = {
  id: string
  title: string
  description: string | null
  youtubeUrl: string
  categoryId: string
  category: { id: string; name: string }
  isPublished: boolean
  publishedAt: string | null
  sortOrder: number
  summary: string | null
  summaryAt: string | null
  admin: { name: string }
  createdAt: string
}

export default function AdminTrainingVideosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [categories, setCategories] = useState<VideoCategory[]>([])
  const [videos, setVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [summarizingId, setSummarizingId] = useState<string | null>(null)

  // カテゴリ管理
  const [showCatForm, setShowCatForm] = useState(false)
  const [catName, setCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [catSubmitting, setCatSubmitting] = useState(false)

  // 動画フォーム
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null)
  const [videoForm, setVideoForm] = useState({
    title: '', description: '', youtubeUrl: '', categoryId: '', isPublished: false,
  })
  const [videoSubmitting, setVideoSubmitting] = useState(false)

  // タブ
  const [activeTab, setActiveTab] = useState<'videos' | 'categories'>('videos')
  // フィルター
  const [filterCatId, setFilterCatId] = useState<string>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchAll()
  }, [status])

  async function fetchAll() {
    try {
      const [catRes, vidRes] = await Promise.all([
        fetch('/api/admin/video-categories'),
        fetch('/api/admin/training-videos'),
      ])
      if (catRes.ok) setCategories(await catRes.json())
      if (vidRes.ok) setVideos(await vidRes.json())
    } finally {
      setLoading(false)
    }
  }

  // === カテゴリ操作 ===
  async function handleCatSubmit() {
    if (!catName.trim()) return
    setCatSubmitting(true)
    setMessage(null)
    try {
      const url = editingCatId ? `/api/admin/video-categories/${editingCatId}` : '/api/admin/video-categories'
      const method = editingCatId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName.trim() }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingCatId ? 'カテゴリを更新しました' : 'カテゴリを作成しました' })
        setCatName('')
        setEditingCatId(null)
        setShowCatForm(false)
        fetchAll()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'エラー' })
      }
    } finally {
      setCatSubmitting(false)
    }
  }

  async function handleDeleteCat(id: string) {
    if (!confirm('このカテゴリを削除しますか？')) return
    const res = await fetch(`/api/admin/video-categories/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage({ type: 'success', text: '削除しました' })
      fetchAll()
    } else {
      const data = await res.json()
      setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
    }
  }

  // === 動画操作 ===
  async function handleVideoSubmit(publish: boolean) {
    setVideoSubmitting(true)
    setMessage(null)
    try {
      const url = editingVideoId ? `/api/admin/training-videos/${editingVideoId}` : '/api/admin/training-videos'
      const method = editingVideoId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...videoForm, isPublished: publish }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingVideoId ? '更新しました' : (publish ? '公開しました' : '下書き保存しました') })
        resetVideoForm()
        fetchAll()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'エラー' })
      }
    } finally {
      setVideoSubmitting(false)
    }
  }

  async function handleDeleteVideo(id: string) {
    if (!confirm('この動画を削除しますか？')) return
    const res = await fetch(`/api/admin/training-videos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage({ type: 'success', text: '削除しました' })
      setVideos(prev => prev.filter(v => v.id !== id))
    }
  }

  async function handleTogglePublish(v: TrainingVideo) {
    const res = await fetch(`/api/admin/training-videos/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !v.isPublished }),
    })
    if (res.ok) {
      setMessage({ type: 'success', text: v.isPublished ? '非公開にしました' : '公開しました' })
      fetchAll()
    }
  }

  async function handleSummarize(id: string) {
    setSummarizingId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/training-videos/${id}/summarize`, { method: 'POST' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'AI要約を生成しました' })
        fetchAll()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '要約の生成に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラー' })
    } finally {
      setSummarizingId(null)
    }
  }

  function startEditVideo(v: TrainingVideo) {
    setEditingVideoId(v.id)
    setVideoForm({
      title: v.title,
      description: v.description || '',
      youtubeUrl: v.youtubeUrl,
      categoryId: v.categoryId,
      isPublished: v.isPublished,
    })
    setShowVideoForm(true)
    setMessage(null)
  }

  function resetVideoForm() {
    setShowVideoForm(false)
    setEditingVideoId(null)
    setVideoForm({ title: '', description: '', youtubeUrl: '', categoryId: categories[0]?.id || '', isPublished: false })
  }

  const filteredVideos = filterCatId === 'all' ? videos : videos.filter(v => v.categoryId === filterCatId)

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">研修動画管理</h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            店舗向け研修動画の管理・配信
          </p>
        </div>
        {activeTab === 'videos' && !showVideoForm && (
          <Button onClick={() => {
            setVideoForm({ ...videoForm, categoryId: categories[0]?.id || '' })
            setShowVideoForm(true)
            setMessage(null)
          }} disabled={categories.length === 0}>
            + 動画を追加
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

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-[var(--md-sys-color-surface-container)] rounded-xl p-1">
        {(['videos', 'categories'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setShowVideoForm(false); setShowCatForm(false); setMessage(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab
                ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {tab === 'videos' ? `動画 (${videos.length})` : `カテゴリ (${categories.length})`}
          </button>
        ))}
      </div>

      {/* === カテゴリタブ === */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {!showCatForm && (
              <Button size="sm" onClick={() => { setShowCatForm(true); setCatName(''); setEditingCatId(null) }}>
                + カテゴリ追加
              </Button>
            )}
          </div>

          {showCatForm && (
            <Card variant="elevated" padding="md" className="mb-4">
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">
                {editingCatId ? 'カテゴリ編集' : '新しいカテゴリ'}
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <TextField
                    label="カテゴリ名"
                    value={catName}
                    onChange={setCatName}
                    placeholder="例: 接客マナー、商品知識、システム操作"
                  />
                </div>
                <Button onClick={handleCatSubmit} disabled={catSubmitting || !catName.trim()} loading={catSubmitting}>
                  {editingCatId ? '更新' : '作成'}
                </Button>
                <Button variant="text" onClick={() => { setShowCatForm(false); setEditingCatId(null) }}>
                  キャンセル
                </Button>
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
              description="動画を追加する前にカテゴリを作成してください"
            />
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{cat.name}</p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{cat._count.videos}件の動画</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingCatId(cat.id); setCatName(cat.name); setShowCatForm(true) }}
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

      {/* === 動画タブ === */}
      {activeTab === 'videos' && (
        <div className="space-y-4">
          {/* 動画作成フォーム */}
          {showVideoForm && (
            <Card variant="elevated" padding="lg" className="mb-4">
              <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-4">
                {editingVideoId ? '動画を編集' : '新しい研修動画'}
              </h3>
              <div className="space-y-4">
                <TextField
                  label="タイトル"
                  value={videoForm.title}
                  onChange={v => setVideoForm({ ...videoForm, title: v })}
                  required
                  placeholder="動画のタイトル"
                />
                <TextField
                  label="YouTube URL"
                  value={videoForm.youtubeUrl}
                  onChange={v => setVideoForm({ ...videoForm, youtubeUrl: v })}
                  required
                  placeholder="https://www.youtube.com/watch?v=... または https://youtu.be/..."
                />

                {/* プレビュー */}
                {videoForm.youtubeUrl && getYoutubeEmbedUrl(videoForm.youtubeUrl) && (
                  <div className="aspect-video max-w-md rounded-xl overflow-hidden bg-black">
                    <iframe
                      src={getYoutubeEmbedUrl(videoForm.youtubeUrl)!}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">カテゴリ</label>
                  <select
                    value={videoForm.categoryId}
                    onChange={e => setVideoForm({ ...videoForm, categoryId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] focus:border-[var(--admin-primary)] outline-none text-sm"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">説明（任意）</label>
                  <textarea
                    value={videoForm.description}
                    onChange={e => setVideoForm({ ...videoForm, description: e.target.value })}
                    rows={3}
                    placeholder="動画の概要や学習ポイント..."
                    className="w-full px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] focus:border-[var(--admin-primary)] outline-none text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleVideoSubmit(true)}
                    disabled={videoSubmitting || !videoForm.title.trim() || !videoForm.youtubeUrl.trim() || !videoForm.categoryId}
                    loading={videoSubmitting}
                  >
                    {editingVideoId ? '更新して公開' : '公開する'}
                  </Button>
                  <Button
                    variant="tonal"
                    onClick={() => handleVideoSubmit(false)}
                    disabled={videoSubmitting || !videoForm.title.trim() || !videoForm.youtubeUrl.trim() || !videoForm.categoryId}
                  >
                    下書き保存
                  </Button>
                  <Button variant="text" onClick={resetVideoForm}>キャンセル</Button>
                </div>
              </div>
            </Card>
          )}

          {/* フィルター */}
          {!showVideoForm && videos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterCatId('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterCatId === 'all'
                    ? 'bg-[var(--admin-primary)] text-[var(--admin-on-primary)]'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                すべて
              </button>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setFilterCatId(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterCatId === c.id
                      ? 'bg-[var(--admin-primary)] text-[var(--admin-on-primary)]'
                      : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* 動画一覧 */}
          {filteredVideos.length === 0 ? (
            <EmptyState
              icon={
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              }
              title={categories.length === 0 ? 'まずカテゴリを作成してください' : '研修動画がありません'}
              description={categories.length === 0 ? 'カテゴリタブからカテゴリを作成後、動画を追加できます' : '「動画を追加」から研修動画を登録しましょう'}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVideos.map(v => {
                const thumb = getYoutubeThumbnail(v.youtubeUrl)
                return (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden group"
                  >
                    {/* サムネイル */}
                    {thumb && (
                      <div className="relative aspect-video bg-black">
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--admin-primary-container)] text-[var(--admin-on-primary-container)]">
                          {v.category.name}
                        </span>
                        {v.isPublished ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">公開中</span>
                        ) : (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">下書き</span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2">
                        {v.title}
                      </h3>
                      {v.description && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                          {v.description}
                        </p>
                      )}
                      <p className="text-xs text-[var(--md-sys-color-outline)] mt-2">
                        {format(new Date(v.createdAt), 'M/d', { locale: ja })} · {v.admin.name}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => startEditVideo(v)} className="text-xs text-[var(--admin-primary)] hover:underline">
                          編集
                        </button>
                        <button onClick={() => handleTogglePublish(v)} className="text-xs text-[var(--admin-primary)] hover:underline">
                          {v.isPublished ? '非公開' : '公開'}
                        </button>
                        <button
                          onClick={() => handleSummarize(v.id)}
                          disabled={summarizingId === v.id}
                          className="text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                        >
                          {summarizingId === v.id ? '要約中...' : (v.summary ? '再要約' : 'AI要約')}
                        </button>
                        <button onClick={() => handleDeleteVideo(v.id)} className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline">
                          削除
                        </button>
                      </div>
                      {v.summary && (
                        <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            AI要約あり
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
