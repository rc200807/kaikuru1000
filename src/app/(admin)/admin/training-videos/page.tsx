'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'

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
  videoUrl: string
  thumbnailUrl: string | null
  fileSize: number | null
  categoryId: string
  category: { id: string; name: string }
  isPublished: boolean
  publishedAt: string | null
  sortOrder: number
  summary: string | null
  summaryAt: string | null
  keyPoints: string | null
  admin: { name: string }
  createdAt: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
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
    title: '', description: '', videoUrl: '', thumbnailUrl: '', fileSize: 0, categoryId: '', isPublished: false, publishedAt: '',
  })
  const [videoSubmitting, setVideoSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  // タブ
  const [activeTab, setActiveTab] = useState<'videos' | 'categories'>('videos')
  // フィルター
  const [filterCatId, setFilterCatId] = useState<string>('all')
  // 詳細モーダル
  const [detailVideo, setDetailVideo] = useState<TrainingVideo | null>(null)

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

  // === ファイルアップロード（Vercel Blob クライアントアップロード） ===
  async function handleVideoUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    setMessage(null)

    // ファイル検証
    const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
    const MAX_SIZE = 500 * 1024 * 1024 // 500MB
    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage({ type: 'error', text: 'MP4・WebM・MOV 形式の動画のみアップロードできます' })
      setUploading(false)
      return
    }
    if (file.size > MAX_SIZE) {
      setMessage({ type: 'error', text: '動画ファイルは500MB以下にしてください' })
      setUploading(false)
      return
    }

    try {
      // Vercel Blob クライアントアップロード: ブラウザから直接ストレージへ送信
      // サーバーレス関数のボディサイズ制限（4.5MB）を回避
      const blob = await upload(
        `training-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.type === 'video/mp4' ? 'mp4' : file.type === 'video/webm' ? 'webm' : 'mov'}`,
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/admin/training-videos/upload',
          onUploadProgress: (e) => {
            setUploadProgress(Math.round(e.percentage))
          },
        },
      )

      setVideoForm(prev => ({ ...prev, videoUrl: blob.url, fileSize: file.size }))
      setMessage({ type: 'success', text: '動画をアップロードしました' })
    } catch (err: any) {
      console.error('Video upload error:', err)
      setMessage({ type: 'error', text: err.message || 'アップロードに失敗しました' })
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleThumbnailUpload(file: File) {
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'thumbnail')
      const res = await fetch('/api/admin/training-videos/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setVideoForm(prev => ({ ...prev, thumbnailUrl: data.url }))
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'サムネイルのアップロードに失敗' })
      }
    } catch {
      setMessage({ type: 'error', text: 'サムネイルのアップロードに失敗しました' })
    }
  }

  // === 動画操作 ===
  async function handleVideoSubmit(publish: boolean) {
    setVideoSubmitting(true)
    setMessage(null)
    try {
      const url = editingVideoId ? `/api/admin/training-videos/${editingVideoId}` : '/api/admin/training-videos'
      const method = editingVideoId ? 'PATCH' : 'POST'
      // 公開日を ISO 文字列に変換（空欄なら null）
      const publishedAtIso = videoForm.publishedAt
        ? new Date(videoForm.publishedAt).toISOString()
        : null
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...videoForm, isPublished: publish, publishedAt: publishedAtIso }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: editingVideoId ? '更新しました' : (publish ? '公開しました' : '下書き保存しました') })
        resetVideoForm()
        fetchAll()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'エラー' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '保存に失敗しました' })
    } finally {
      setVideoSubmitting(false)
    }
  }

  async function handleDeleteVideo(id: string) {
    if (!confirm('この動画を削除しますか？動画ファイルも削除されます。')) return
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
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl || '',
      fileSize: v.fileSize || 0,
      categoryId: v.categoryId,
      isPublished: v.isPublished,
      publishedAt: v.publishedAt ? format(new Date(v.publishedAt), 'yyyy-MM-dd') : '',
    })
    setShowVideoForm(true)
    setMessage(null)
  }

  function resetVideoForm() {
    setShowVideoForm(false)
    setEditingVideoId(null)
    setVideoForm({ title: '', description: '', videoUrl: '', thumbnailUrl: '', fileSize: 0, categoryId: categories[0]?.id || '', isPublished: false, publishedAt: '' })
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
              icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
              title="カテゴリがありません"
              description="動画を追加する前にカテゴリを作成してください"
            />
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{cat.name}</p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{cat._count.videos}件の動画</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingCatId(cat.id); setCatName(cat.name); setShowCatForm(true) }} className="text-xs text-[var(--admin-primary)] hover:underline">編集</button>
                    <button onClick={() => handleDeleteCat(cat.id)} className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline">削除</button>
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

                {/* 動画ファイルアップロード */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-2">動画ファイル</label>
                  {videoForm.videoUrl ? (
                    <div className="space-y-3">
                      {/* アップロード済みプレビュー */}
                      <div className="aspect-video max-w-lg rounded-xl overflow-hidden bg-black">
                        <video
                          src={videoForm.videoUrl}
                          controls
                          className="w-full h-full"
                          preload="metadata"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          アップロード済み {videoForm.fileSize ? `(${formatFileSize(videoForm.fileSize)})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setVideoForm(prev => ({ ...prev, videoUrl: '', fileSize: 0 }))
                            if (videoInputRef.current) videoInputRef.current.value = ''
                          }}
                          className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline"
                        >
                          差し替え
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => !uploading && videoInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                      onDrop={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        const file = e.dataTransfer.files[0]
                        if (file && !uploading) handleVideoUpload(file)
                      }}
                      className={`
                        relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors
                        ${uploading
                          ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-container)]/10'
                          : 'border-[var(--md-sys-color-outline-variant)] hover:border-[var(--admin-primary)] hover:bg-[var(--md-sys-color-surface-container-low)]'
                        }
                      `}
                    >
                      {uploading ? (
                        <div className="space-y-3">
                          <div className="w-12 h-12 mx-auto rounded-full border-4 border-[var(--admin-primary-container)] border-t-[var(--admin-primary)] animate-spin" />
                          <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">アップロード中... {uploadProgress}%</p>
                          <div className="max-w-xs mx-auto h-2 bg-[var(--md-sys-color-surface-container)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--admin-primary)] rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <svg className="w-12 h-12 mx-auto text-[var(--md-sys-color-on-surface-variant)] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                            クリックまたはドラッグ&ドロップ
                          </p>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                            MP4・WebM・MOV（最大500MB）
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleVideoUpload(file)
                    }}
                  />
                </div>

                {/* サムネイル画像（任意） */}
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-2">
                    サムネイル画像（任意）
                  </label>
                  {videoForm.thumbnailUrl ? (
                    <div className="flex items-start gap-3">
                      <img src={videoForm.thumbnailUrl} alt="" className="w-40 h-auto rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setVideoForm(prev => ({ ...prev, thumbnailUrl: '' }))
                          if (thumbInputRef.current) thumbInputRef.current.value = ''
                        }}
                        className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline"
                      >
                        削除
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => thumbInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-sm text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--admin-primary)] hover:text-[var(--admin-primary)] transition-colors"
                    >
                      画像を選択
                    </button>
                  )}
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleThumbnailUpload(file)
                    }}
                  />
                </div>

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
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">公開日（任意）</label>
                  <input
                    type="date"
                    value={videoForm.publishedAt}
                    onChange={e => setVideoForm({ ...videoForm, publishedAt: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] focus:border-[var(--admin-primary)] outline-none text-sm"
                  />
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    動画一覧はこの公開日の新しい順に並びます。空欄の場合は公開時の日時を自動でセットします。
                  </p>
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
                    disabled={videoSubmitting || uploading || !videoForm.title.trim() || !videoForm.videoUrl || !videoForm.categoryId}
                    loading={videoSubmitting}
                  >
                    {editingVideoId ? '更新して公開' : '公開する'}
                  </Button>
                  <Button
                    variant="tonal"
                    onClick={() => handleVideoSubmit(false)}
                    disabled={videoSubmitting || uploading || !videoForm.title.trim() || !videoForm.videoUrl || !videoForm.categoryId}
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
              icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
              title={categories.length === 0 ? 'まずカテゴリを作成してください' : '研修動画がありません'}
              description={categories.length === 0 ? 'カテゴリタブからカテゴリを作成後、動画を追加できます' : '「動画を追加」から研修動画を登録しましょう'}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVideos.map(v => (
                <div
                  key={v.id}
                  className={`relative rounded-2xl border overflow-hidden group transition-all ${
                    summarizingId === v.id
                      ? 'border-purple-400/60 dark:border-purple-500/40 shadow-[0_0_16px_rgba(139,92,246,0.15)]'
                      : 'border-[var(--md-sys-color-outline-variant)]'
                  } bg-[var(--md-sys-color-surface-container-low)]`}
                >
                  {/* サムネイル / 動画プレビュー */}
                  <button onClick={() => setDetailVideo(v)} className="relative aspect-video bg-black/90 w-full">
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                    {v.fileSize && (
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                        {formatFileSize(v.fileSize)}
                      </span>
                    )}
                  </button>

                  {/* 要約中プログレスバー */}
                  {summarizingId === v.id && (
                    <div className="h-1 bg-purple-100 dark:bg-purple-950/40 overflow-hidden">
                      <div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #3b82f6, #06b6d4)', animation: 'ai-progress 2s ease-in-out infinite' }} />
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--admin-primary-container)] text-[var(--admin-on-primary-container)]">{v.category.name}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2">{v.title}</h3>
                    {v.description && (
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">{v.description}</p>
                    )}
                    <p className="text-xs text-[var(--md-sys-color-outline)] mt-2">
                      {v.publishedAt
                        ? `公開日 ${format(new Date(v.publishedAt), 'yyyy/M/d', { locale: ja })}`
                        : `登録 ${format(new Date(v.createdAt), 'M/d', { locale: ja })}`} · {v.admin.name}
                    </p>

                    {/* 公開トグル + アクション */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTogglePublish(v) }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${v.isPublished ? 'bg-green-500' : 'bg-[var(--md-sys-color-outline-variant)]'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${v.isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                        <span className={`text-xs font-medium ${v.isPublished ? 'text-green-600 dark:text-green-400' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                          {v.isPublished ? '公開中' : '非公開'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEditVideo(v)} className="text-xs text-[var(--admin-primary)] hover:underline">編集</button>
                        <button
                          onClick={() => handleSummarize(v.id)}
                          disabled={summarizingId === v.id}
                          className="text-xs text-[#E8927C] hover:underline disabled:opacity-50"
                        >
                          {v.summary ? '再要約' : 'AI要約'}
                        </button>
                        <button onClick={() => handleDeleteVideo(v.id)} className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline">削除</button>
                      </div>
                    </div>

                    {/* 詳細を見る */}
                    <button
                      onClick={() => setDetailVideo(v)}
                      className="mt-3 w-full py-2.5 rounded-xl bg-[var(--admin-primary)] text-[var(--admin-on-primary)] text-sm font-semibold hover:opacity-90 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                      詳細を見る
                    </button>
                    {v.summary && (
                      <button onClick={() => setDetailVideo(v)} className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)] w-full text-left">
                        <p className="text-xs text-[#E8927C] font-medium flex items-center gap-1 hover:underline">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                          AI要約を確認
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI要約アニメーション用CSS */}
      {summarizingId && (
        <style>{`
          @keyframes ai-spin { to { transform: rotate(360deg); } }
          @keyframes ai-progress { 0% { width: 10%; } 50% { width: 75%; } 100% { width: 40%; } }
        `}</style>
      )}

      {/* ===== 動画詳細モーダル ===== */}
      <Modal open={!!detailVideo} onClose={() => setDetailVideo(null)} title={detailVideo?.title || '動画詳細'} size="lg">
        {detailVideo && (() => {
          let keyPoints: string[] = []
          if (detailVideo.keyPoints) {
            try { keyPoints = JSON.parse(detailVideo.keyPoints) } catch { /* ignore */ }
          }
          return (
            <div className="space-y-5">
              {/* 動画プレーヤー */}
              <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                <video
                  src={detailVideo.videoUrl}
                  controls
                  className="w-full h-full"
                  preload="metadata"
                  poster={detailVideo.thumbnailUrl || undefined}
                />
              </div>

              {/* 基本情報 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--admin-primary-container)] text-[var(--admin-on-primary-container)]">{detailVideo.category.name}</span>
                {detailVideo.isPublished ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">公開中</span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">下書き</span>
                )}
                {detailVideo.fileSize && (
                  <span className="text-xs text-[var(--md-sys-color-outline)]">{formatFileSize(detailVideo.fileSize)}</span>
                )}
                <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto">
                  {detailVideo.publishedAt
                    ? `公開日 ${format(new Date(detailVideo.publishedAt), 'yyyy年M月d日', { locale: ja })}`
                    : `登録 ${format(new Date(detailVideo.createdAt), 'yyyy年M月d日', { locale: ja })}`} · {detailVideo.admin.name}
                </span>
              </div>

              {/* 説明 */}
              {detailVideo.description && (
                <div className="px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                  <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{detailVideo.description}</p>
                </div>
              )}

              {/* AI要約セクション */}
              {detailVideo.summary ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#E8927C] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">AI要約</h3>
                      {detailVideo.summaryAt && <p className="text-xs text-[var(--md-sys-color-outline)]">{format(new Date(detailVideo.summaryAt), 'yyyy年M月d日 生成', { locale: ja })}</p>}
                    </div>
                  </div>
                  <div className="px-5 py-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
                    <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap leading-relaxed">{detailVideo.summary}</p>
                  </div>
                  {keyPoints.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-[var(--admin-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        重要ポイント
                      </h4>
                      <div className="space-y-2">
                        {keyPoints.map((point, i) => (
                          <div key={i} className="flex gap-3 px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--admin-primary)] text-[var(--admin-on-primary)] text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                            <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-relaxed">{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-3">AI要約はまだ生成されていません</p>
                  <Button size="sm" variant="tonal" onClick={() => { handleSummarize(detailVideo.id); setDetailVideo(null) }}>AI要約を生成</Button>
                </div>
              )}

              {/* アクション */}
              <div className="flex items-center gap-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { handleTogglePublish(detailVideo); setDetailVideo(null) }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${detailVideo.isPublished ? 'bg-green-500' : 'bg-[var(--md-sys-color-outline-variant)]'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${detailVideo.isPublished ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className={`text-sm font-medium ${detailVideo.isPublished ? 'text-green-600 dark:text-green-400' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                    {detailVideo.isPublished ? '公開中' : '非公開'}
                  </span>
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" variant="tonal" onClick={() => { startEditVideo(detailVideo); setDetailVideo(null) }}>編集</Button>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
