'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'

type StoreInfo = { id: string; name: string; avatar: string | null }
type Reaction = { emoji: string; count: number; reacted: boolean }
type Thread = {
  id: string
  title: string
  content: string
  imageUrls: string[]
  isPinned: boolean
  store: StoreInfo
  replyCount: number
  reactions: Reaction[]
  createdAt: string
  updatedAt: string
}
type Reply = {
  id: string
  content: string
  store: StoreInfo
  createdAt: string
}
type ThreadDetail = Thread & { replies: Reply[] }

const PRESET_EMOJI = ['👍', '❤️', '🔥', '💡', '👏', '😊']

/* ── Avatar ─────────────────────────────────────── */
function Avatar({ store, size = 'md' }: { store: StoreInfo; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  if (store.avatar) return <img src={store.avatar} className={`${dim} rounded-full object-cover flex-shrink-0`} alt="" />
  return (
    <div className={`${dim} rounded-full bg-[var(--store-primary)] flex items-center justify-center flex-shrink-0`}>
      <span className={`text-[var(--store-on-primary)] ${text} font-bold`}>{store.name[0]}</span>
    </div>
  )
}

/* ── Image Grid ─────────────────────────────────── */
function ImageGrid({ images, onOpen }: { images: string[]; onOpen: (url: string) => void }) {
  if (!images || images.length === 0) return null
  return (
    <div className={`mt-3 grid gap-1 rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] ${
      images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
    }`}>
      {images.map((url, i) => (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); onOpen(url) }}
          className={`relative block w-full overflow-hidden bg-[var(--md-sys-color-surface-container)] ${
            images.length === 3 && i === 0 ? 'row-span-2' : ''
          }`}
        >
          <img
            src={url}
            alt=""
            className={`w-full object-cover hover:brightness-95 transition ${
              images.length === 1 ? 'max-h-[300px]'
                : images.length === 3 && i === 0 ? 'h-full' : 'aspect-square'
            }`}
            style={images.length === 1 ? { maxHeight: '300px' } : undefined}
          />
        </button>
      ))}
    </div>
  )
}

/* ── Main ─────────────────────────────────────── */
export default function CommunityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // ページネーション
  const [threadsPage, setThreadsPage] = useState(1)
  const [threadsHasMore, setThreadsHasMore] = useState(false)
  const [threadsTotal, setThreadsTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const THREADS_LIMIT = 20

  // Compose modal
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImages, setNewImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Detail modal
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [replying, setReplying] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const repliesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchThreads = useCallback(async () => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    params.set('page', '1')
    params.set('limit', String(THREADS_LIMIT))
    const res = await fetch(`/api/store/community?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      const list = data?.threads ?? (Array.isArray(data) ? data : [])
      setThreads(list)
      setThreadsTotal(data?.total ?? list.length)
      setThreadsPage(1)
      setThreadsHasMore((data?.total ?? list.length) > THREADS_LIMIT)
    }
    setLoading(false)
  }, [debouncedSearch])

  useEffect(() => {
    if (status === 'authenticated') fetchThreads()
  }, [status, fetchThreads])

  async function loadMoreThreads() {
    setLoadingMore(true)
    const nextPage = threadsPage + 1
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    params.set('page', String(nextPage))
    params.set('limit', String(THREADS_LIMIT))
    try {
      const res = await fetch(`/api/store/community?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const list = data?.threads ?? (Array.isArray(data) ? data : [])
        setThreads(prev => [...prev, ...list])
        setThreadsPage(nextPage)
        setThreadsHasMore(nextPage * THREADS_LIMIT < (data?.total ?? 0))
      }
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  /* ── Actions ── */
  const openThread = async (threadId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setShowEmojiPicker(false)
    const res = await fetch(`/api/store/community/${threadId}`)
    if (res.ok) setSelectedThread(await res.json())
    setDetailLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (newImages.length >= 3) { alert('画像は最大3枚までです'); return }
    setUploading(true)
    for (const file of Array.from(files).slice(0, 3 - newImages.length)) {
      if (file.size > 10 * 1024 * 1024) { alert(`${file.name}: 10MB以下にしてください`); continue }
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/store/community/images', { method: 'POST', body: fd })
        if (res.ok) { const { url } = await res.json(); setNewImages(p => [...p, url]) }
        else { const err = await res.json(); alert(err.error || 'アップロード失敗') }
      } catch { alert('アップロード失敗') }
    }
    setUploading(false)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const removeImage = (i: number) => setNewImages(p => p.filter((_, idx) => idx !== i))

  const createThread = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setCreating(true)
    const res = await fetch('/api/store/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, content: newContent, imageUrls: newImages }),
    })
    if (res.ok) {
      setNewTitle(''); setNewContent(''); setNewImages([]); setShowNewForm(false)
      await fetchThreads()
    }
    setCreating(false)
  }

  const addReply = async () => {
    if (!selectedThread || !replyContent.trim()) return
    setReplying(true)
    const res = await fetch(`/api/store/community/${selectedThread.id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: replyContent }),
    })
    if (res.ok) {
      const reply = await res.json()
      setSelectedThread(p => p ? { ...p, replies: [...p.replies, reply] } : p)
      setReplyContent('')
      setThreads(p => p.map(t => t.id === selectedThread.id ? { ...t, replyCount: t.replyCount + 1 } : t))
      setTimeout(() => repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    setReplying(false)
  }

  const toggleReaction = async (threadId: string, emoji: string) => {
    const res = await fetch(`/api/store/community/${threadId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    })
    if (!res.ok) return
    const { action } = await res.json()
    const update = (reactions: Reaction[]): Reaction[] => {
      const ex = reactions.find(r => r.emoji === emoji)
      if (action === 'added') {
        return ex ? reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r) : [...reactions, { emoji, count: 1, reacted: true }]
      }
      return ex && ex.count <= 1 ? reactions.filter(r => r.emoji !== emoji) : reactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r)
    }
    setThreads(p => p.map(t => t.id === threadId ? { ...t, reactions: update(t.reactions) } : t))
    if (selectedThread?.id === threadId) setSelectedThread(p => p ? { ...p, reactions: update(p.reactions) } : p)
  }

  const deleteThread = async (threadId: string) => {
    if (!confirm('この投稿を削除しますか？返信もすべて削除されます。')) return
    const res = await fetch(`/api/store/community/${threadId}`, { method: 'DELETE' })
    if (res.ok) {
      setDetailOpen(false); setSelectedThread(null)
      setThreads(p => p.filter(t => t.id !== threadId))
    }
  }

  const currentStoreId = user?.storeId || user?.id

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">コミュニティ</h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">店舗間の情報交換・相談の場</p>
        </div>
        <Button
          onClick={() => setShowNewForm(true)}
          icon={
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          }
        >
          新規投稿
        </Button>
      </div>

      {/* ── Search ── */}
      <div className="mb-4">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="スレッドを検索..."
            className="w-full h-10 pl-9 pr-4 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-sm text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-2 focus:outline-[var(--store-primary)] transition-colors"
          />
        </div>
      </div>

      {/* ── Thread List ── */}
      {threads.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          }
          title={search ? '検索結果がありません' : 'まだ投稿がありません'}
          description={search ? '別のキーワードで検索してみてください' : '最初の投稿を作成して、他の店舗と情報交換しましょう'}
          action={!search ? <Button onClick={() => setShowNewForm(true)} variant="tonal">投稿を作成する</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {threads.map(thread => (
            <div
              key={thread.id}
              onClick={() => openThread(thread.id)}
              className="px-5 py-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors cursor-pointer group"
            >
              {/* Header: avatar + name + pin + time */}
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar store={thread.store} size="sm" />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {thread.isPinned && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0">
                      📌 固定
                    </span>
                  )}
                  <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">
                    {thread.store.name}
                  </span>
                  <span className="text-xs text-[var(--md-sys-color-outline)] ml-auto flex-shrink-0">
                    {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true, locale: ja })}
                  </span>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--store-primary)] transition-colors leading-snug">
                {thread.title}
              </h3>

              {/* Content preview */}
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1 leading-relaxed">
                {thread.content}
              </p>

              {/* Images */}
              <ImageGrid images={thread.imageUrls} onOpen={setLightboxUrl} />

              {/* Reactions + Reply count */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {thread.reactions.map(r => (
                  <button
                    key={r.emoji}
                    onClick={e => { e.stopPropagation(); toggleReaction(thread.id, r.emoji) }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                      r.reacted
                        ? 'bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)] border border-[var(--store-primary)]'
                        : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent hover:border-[var(--md-sys-color-outline-variant)]'
                    }`}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.count}</span>
                  </button>
                ))}
                <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-outline)] ml-auto">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                  </svg>
                  <span>{thread.replyCount}</span>
                </div>
              </div>
            </div>
          ))}

          {threadsHasMore && (
            <div className="flex justify-center mt-4">
              <Button
                variant="tonal"
                onClick={loadMoreThreads}
                loading={loadingMore}
                disabled={loadingMore}
              >
                {loadingMore ? '読み込み中...' : `もっと読み込む（${threads.length} / ${threadsTotal}件）`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── New Thread Modal ── */}
      <Modal
        open={showNewForm}
        onClose={() => setShowNewForm(false)}
        title="新しい投稿"
        size="lg"
        footer={
          <>
            <Button variant="text" onClick={() => { setShowNewForm(false); setNewTitle(''); setNewContent(''); setNewImages([]) }}>
              キャンセル
            </Button>
            <Button onClick={createThread} loading={creating} disabled={!newTitle.trim() || !newContent.trim()}>
              投稿する
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="タイトル" value={newTitle} onChange={setNewTitle} required placeholder="スレッドのタイトルを入力" />
          <TextField label="本文" value={newContent} onChange={setNewContent} required rows={6} placeholder="投稿内容を入力..." />
          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-2">画像（最大3枚）</label>
            {newImages.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {newImages.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-20 h-20 rounded-xl object-cover border border-[var(--md-sys-color-outline-variant)]" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {newImages.length < 3 && (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-sm text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--store-primary)] hover:text-[var(--store-primary)] transition-colors disabled:opacity-50"
              >
                {uploading ? <LoadingSpinner size="sm" /> : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {uploading ? 'アップロード中...' : '画像を追加'}
              </button>
            )}
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={handleImageUpload} className="hidden" />
          </div>
        </div>
      </Modal>

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── Thread Detail Modal ── */}
      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedThread(null); setReplyContent(''); setShowEmojiPicker(false) }}
        title={selectedThread?.title || 'スレッド詳細'}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="md" /></div>
        ) : selectedThread ? (
          <div className="flex flex-col gap-4">
            {/* Author */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar store={selectedThread.store} />
                <div>
                  <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{selectedThread.store.name}</p>
                  <p className="text-xs text-[var(--md-sys-color-outline)]">
                    {formatDistanceToNow(new Date(selectedThread.createdAt), { addSuffix: true, locale: ja })}
                  </p>
                </div>
              </div>
              {selectedThread.store.id === currentStoreId && (
                <button
                  onClick={() => deleteThread(selectedThread.id)}
                  className="p-1.5 rounded-full text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] transition-colors"
                  title="削除"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            {/* Content */}
            <div className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap leading-relaxed">
              {selectedThread.content}
            </div>

            {/* Images */}
            <ImageGrid images={selectedThread.imageUrls} onOpen={setLightboxUrl} />

            {/* Reactions */}
            <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
              {selectedThread.reactions.map(r => (
                <button
                  key={r.emoji}
                  onClick={() => toggleReaction(selectedThread.id, r.emoji)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                    r.reacted
                      ? 'bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)] border border-[var(--store-primary)]'
                      : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent hover:border-[var(--md-sys-color-outline-variant)]'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors text-sm"
                  title="リアクションを追加"
                >
                  +
                </button>
                {showEmojiPicker && (
                  <div className="absolute left-0 top-full mt-1 z-20 flex gap-1 p-2 rounded-xl bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-lg border border-[var(--md-sys-color-outline-variant)]">
                    {PRESET_EMOJI.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { toggleReaction(selectedThread.id, emoji); setShowEmojiPicker(false) }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors text-lg"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Replies */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] tracking-wider">
                返信 ({selectedThread.replies.length})
              </p>
              {selectedThread.replies.length === 0 ? (
                <p className="text-sm text-[var(--md-sys-color-outline)] py-4 text-center">まだ返信はありません</p>
              ) : (
                selectedThread.replies.map(reply => (
                  <div key={reply.id} className="flex gap-3 p-3 rounded-xl bg-[var(--md-sys-color-surface-container)]">
                    <Avatar store={reply.store} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">{reply.store.name}</span>
                        <span className="text-[10px] text-[var(--md-sys-color-outline)]">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true, locale: ja })}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={repliesEndRef} />
            </div>

            {/* Reply form */}
            <div className="flex gap-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
              <div className="flex-1">
                <textarea
                  value={replyContent}
                  onChange={e => setReplyContent(e.target.value)}
                  placeholder="返信を入力..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-sm text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-2 focus:outline-[var(--store-primary)] resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addReply() } }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  onClick={addReply}
                  loading={replying}
                  disabled={!replyContent.trim()}
                  icon={
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                    </svg>
                  }
                >
                  送信
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
