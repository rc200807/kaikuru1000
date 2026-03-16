'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'

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
type ThreadDetail = Thread & {
  replies: Reply[]
}

const PRESET_EMOJI = ['👍', '❤️', '🔥', '💡', '👏', '😊']

/* ---------- Avatar helper ---------- */
function Avatar({ store, size = 'md' }: { store: StoreInfo; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'md' ? 'w-10 h-10' : 'w-12 h-12'
  const textSize = size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-sm'
  if (store.avatar) {
    return <img src={store.avatar} className={`${dim} rounded-full object-cover flex-shrink-0`} alt="" />
  }
  return (
    <div className={`${dim} rounded-full bg-[var(--store-primary)] flex items-center justify-center flex-shrink-0`}>
      <span className={`text-[var(--store-on-primary)] ${textSize} font-bold`}>{store.name[0]}</span>
    </div>
  )
}

export default function CommunityPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Compose
  const [composeOpen, setComposeOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImages, setNewImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const composeTextRef = useRef<HTMLTextAreaElement>(null)

  // Thread detail (X-style overlay)
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [replying, setReplying] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null) // threadId or null

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const repliesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchThreads = useCallback(async () => {
    const params = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''
    const res = await fetch(`/api/store/community${params}`)
    if (res.ok) setThreads(await res.json())
    setLoading(false)
  }, [debouncedSearch])

  useEffect(() => {
    if (status === 'authenticated') fetchThreads()
  }, [status, fetchThreads])

  /* ---------- Actions ---------- */
  const openThread = async (threadId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setShowEmojiPicker(null)
    const res = await fetch(`/api/store/community/${threadId}`)
    if (res.ok) setSelectedThread(await res.json())
    setDetailLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (newImages.length >= 3) { alert('画像は最大3枚までです'); return }
    setUploading(true)
    const remaining = 3 - newImages.length
    for (const file of Array.from(files).slice(0, remaining)) {
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
      setNewTitle(''); setNewContent(''); setNewImages([]); setComposeOpen(false)
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
      } else {
        return ex && ex.count <= 1 ? reactions.filter(r => r.emoji !== emoji) : reactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r)
      }
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
  const currentStore: StoreInfo = { id: currentStoreId, name: user?.name || '', avatar: user?.avatar || null }

  // Total heart count helper
  const heartCount = (reactions: Reaction[]) => {
    const heart = reactions.find(r => r.emoji === '❤️')
    return heart ? heart.count : 0
  }
  const hasHearted = (reactions: Reaction[]) => {
    const heart = reactions.find(r => r.emoji === '❤️')
    return heart?.reacted || false
  }

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  /* ========== Image Grid Component ========== */
  const ImageGrid = ({ images, maxH = '320px' }: { images: string[]; maxH?: string }) => {
    if (!images || images.length === 0) return null
    return (
      <div
        className={`mt-3 rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)] grid ${
          images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
        } gap-px bg-[var(--md-sys-color-outline-variant)]`}
      >
        {images.map((url, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(url) }}
            className={`relative block w-full overflow-hidden bg-black/5 ${
              images.length === 3 && i === 0 ? 'row-span-2' : ''
            }`}
          >
            <img
              src={url}
              alt=""
              className={`w-full object-cover hover:brightness-90 transition-all duration-200 ${
                images.length === 1
                  ? `max-h-[${maxH}]`
                  : images.length === 3 && i === 0
                  ? 'h-full'
                  : 'aspect-square'
              }`}
              style={images.length === 1 ? { maxHeight: maxH } : undefined}
            />
          </button>
        ))}
      </div>
    )
  }

  /* ========== Action Bar (X-style) ========== */
  const ActionBar = ({ thread, compact = false }: { thread: Thread; compact?: boolean }) => {
    const iconClass = compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'
    const textClass = compact ? 'text-xs' : 'text-[13px]'
    return (
      <div className={`flex items-center justify-between ${compact ? 'mt-2' : 'mt-3'} max-w-md`}>
        {/* Reply */}
        <button
          onClick={(e) => { e.stopPropagation(); openThread(thread.id) }}
          className="group flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-blue-500 transition-colors"
        >
          <div className="p-1.5 rounded-full group-hover:bg-blue-500/10 transition-colors">
            <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
            </svg>
          </div>
          {thread.replyCount > 0 && <span className={textClass}>{thread.replyCount}</span>}
        </button>

        {/* Heart / Like */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleReaction(thread.id, '❤️') }}
          className={`group flex items-center gap-1.5 transition-colors ${
            hasHearted(thread.reactions)
              ? 'text-pink-500'
              : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-pink-500'
          }`}
        >
          <div className="p-1.5 rounded-full group-hover:bg-pink-500/10 transition-colors">
            {hasHearted(thread.reactions) ? (
              <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            ) : (
              <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            )}
          </div>
          {heartCount(thread.reactions) > 0 && <span className={textClass}>{heartCount(thread.reactions)}</span>}
        </button>

        {/* Emoji reactions */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === thread.id ? null : thread.id) }}
            className="group flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--store-primary)] transition-colors"
          >
            <div className="p-1.5 rounded-full group-hover:bg-[var(--store-primary)]/10 transition-colors">
              <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </div>
          </button>
          {showEmojiPicker === thread.id && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 flex gap-1 p-2 rounded-2xl bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-xl border border-[var(--md-sys-color-outline-variant)]" onClick={(e) => e.stopPropagation()}>
              {PRESET_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); toggleReaction(thread.id, emoji); setShowEmojiPicker(null) }}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors text-lg hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More / Delete (own posts) */}
        {thread.store.id === currentStoreId && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteThread(thread.id) }}
            className="group text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] transition-colors"
          >
            <div className="p-1.5 rounded-full group-hover:bg-[var(--md-sys-color-error)]/10 transition-colors">
              <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
          </button>
        )}
      </div>
    )
  }

  /* ========== Emoji reaction pills (non-heart) ========== */
  const ReactionPills = ({ thread }: { thread: Thread }) => {
    const nonHeart = thread.reactions.filter(r => r.emoji !== '❤️')
    if (nonHeart.length === 0) return null
    return (
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {nonHeart.map(r => (
          <button
            key={r.emoji}
            onClick={(e) => { e.stopPropagation(); toggleReaction(thread.id, r.emoji) }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
              r.reacted
                ? 'bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)] border border-[var(--store-primary)]'
                : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent hover:border-[var(--md-sys-color-outline-variant)]'
            }`}
          >
            <span>{r.emoji}</span><span>{r.count}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* ===== Sticky Header ===== */}
      <div className="sticky top-0 z-20 bg-[var(--md-sys-color-surface)]/80 backdrop-blur-md border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">コミュニティ</h1>
        </div>
      </div>

      {/* ===== Compose Area (X-style) ===== */}
      <div className="border-b border-[var(--md-sys-color-outline-variant)]">
        {!composeOpen ? (
          <button
            onClick={() => { setComposeOpen(true); setTimeout(() => composeTextRef.current?.focus(), 100) }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
          >
            <Avatar store={currentStore} size="md" />
            <span className="text-sm text-[var(--md-sys-color-outline)]">いまどうしてる？</span>
          </button>
        ) : (
          <div className="px-4 py-3">
            <div className="flex gap-3">
              <Avatar store={currentStore} size="md" />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="トピック（タイトル）"
                  className="w-full text-[15px] font-bold text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] bg-transparent border-none outline-none mb-1"
                />
                <textarea
                  ref={composeTextRef}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="いまどうしてる？"
                  rows={3}
                  className="w-full text-[15px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] bg-transparent border-none outline-none resize-none leading-relaxed"
                />
                {/* Uploaded images preview */}
                {newImages.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {newImages.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-20 h-20 rounded-xl object-cover" />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-xs hover:bg-black/90"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Bottom toolbar */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
                  <div className="flex items-center gap-1">
                    {/* Image button */}
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploading || newImages.length >= 3}
                      className="p-2 rounded-full text-[var(--store-primary)] hover:bg-[var(--store-primary)]/10 transition-colors disabled:opacity-30"
                    >
                      {uploading ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      )}
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setComposeOpen(false); setNewTitle(''); setNewContent(''); setNewImages([]) }}
                      className="px-3 py-1.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] rounded-full transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={createThread}
                      disabled={creating || !newTitle.trim() || !newContent.trim()}
                      className="px-5 py-1.5 text-sm font-bold text-white bg-[var(--store-primary)] rounded-full hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {creating ? '投稿中...' : '投稿する'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Search ===== */}
      <div className="px-4 py-2 border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-outline)]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索"
            className="w-full h-9 pl-9 pr-4 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-sm text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-2 focus:outline-[var(--store-primary)] transition-colors"
          />
        </div>
      </div>

      {/* ===== Timeline ===== */}
      {threads.length === 0 ? (
        <div className="text-center py-16 px-8">
          <p className="text-lg font-bold text-[var(--md-sys-color-on-surface)] mb-1">
            {search ? '検索結果がありません' : 'まだ投稿がありません'}
          </p>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {search ? '別のキーワードで検索してみてください' : '最初の投稿を作成して、他の店舗と情報交換しましょう'}
          </p>
        </div>
      ) : (
        <div>
          {threads.map((thread) => (
            <article
              key={thread.id}
              onClick={() => openThread(thread.id)}
              className="flex gap-3 px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-low)]/50 transition-colors cursor-pointer"
            >
              {/* Left: Avatar */}
              <div className="flex-shrink-0 pt-0.5">
                <Avatar store={thread.store} size="md" />
              </div>

              {/* Right: Content */}
              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {thread.isPinned && (
                    <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)] truncate">
                    {thread.store.name}
                  </span>
                  <span className="text-[13px] text-[var(--md-sys-color-outline)]">·</span>
                  <span className="text-[13px] text-[var(--md-sys-color-outline)] flex-shrink-0">
                    {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: false, locale: ja })}
                  </span>
                </div>

                {/* Title (bold, like a topic) */}
                <p className="text-[15px] font-semibold text-[var(--md-sys-color-on-surface)] mt-0.5 leading-snug">
                  {thread.title}
                </p>

                {/* Content */}
                <p className="text-[15px] text-[var(--md-sys-color-on-surface)] mt-0.5 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                  {thread.content}
                </p>

                {/* Images */}
                <ImageGrid images={thread.imageUrls} maxH="280px" />

                {/* Emoji reaction pills */}
                <ReactionPills thread={thread} />

                {/* Action bar */}
                <ActionBar thread={thread} />
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ===== Lightbox ===== */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ===== Thread Detail Overlay (X-style full screen) ===== */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--md-sys-color-surface)] overflow-y-auto">
          {/* Detail header */}
          <div className="sticky top-0 z-10 bg-[var(--md-sys-color-surface)]/80 backdrop-blur-md border-b border-[var(--md-sys-color-outline-variant)]">
            <div className="flex items-center gap-4 px-4 h-[53px]">
              <button
                onClick={() => { setDetailOpen(false); setSelectedThread(null); setReplyContent(''); setShowEmojiPicker(null) }}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              >
                <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">ポスト</h2>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>
          ) : selectedThread ? (
            <div className="max-w-xl mx-auto">
              {/* ===== Original Post ===== */}
              <div className="px-4 pt-4 pb-0">
                {/* Author header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar store={selectedThread.store} size="lg" />
                    <div>
                      <p className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
                        {selectedThread.store.name}
                      </p>
                      <p className="text-[13px] text-[var(--md-sys-color-outline)]">
                        {formatDistanceToNow(new Date(selectedThread.createdAt), { addSuffix: true, locale: ja })}
                      </p>
                    </div>
                  </div>
                  {selectedThread.store.id === currentStoreId && (
                    <button
                      onClick={() => deleteThread(selectedThread.id)}
                      className="p-2 rounded-full text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error)]/10 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mt-3 leading-tight">
                  {selectedThread.title}
                </h2>

                {/* Content */}
                <div className="text-[15px] text-[var(--md-sys-color-on-surface)] mt-2 leading-relaxed whitespace-pre-wrap">
                  {selectedThread.content}
                </div>

                {/* Images */}
                <ImageGrid images={selectedThread.imageUrls} maxH="420px" />

                {/* Emoji pills */}
                <ReactionPills thread={selectedThread} />

                {/* Stats bar */}
                <div className="flex items-center gap-4 mt-3 py-3 border-t border-b border-[var(--md-sys-color-outline-variant)] text-[13px] text-[var(--md-sys-color-outline)]">
                  {selectedThread.replyCount > 0 && (
                    <span><strong className="text-[var(--md-sys-color-on-surface)]">{selectedThread.replyCount}</strong> 件の返信</span>
                  )}
                  {heartCount(selectedThread.reactions) > 0 && (
                    <span><strong className="text-[var(--md-sys-color-on-surface)]">{heartCount(selectedThread.reactions)}</strong> いいね</span>
                  )}
                  {selectedThread.reactions.filter(r => r.emoji !== '❤️').length > 0 && (
                    <span><strong className="text-[var(--md-sys-color-on-surface)]">{selectedThread.reactions.filter(r => r.emoji !== '❤️').reduce((s, r) => s + r.count, 0)}</strong> リアクション</span>
                  )}
                </div>

                {/* Action bar */}
                <div className="py-1 border-b border-[var(--md-sys-color-outline-variant)]">
                  <ActionBar thread={selectedThread} />
                </div>
              </div>

              {/* ===== Reply Form ===== */}
              <div className="flex gap-3 px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)]">
                <Avatar store={currentStore} size="sm" />
                <div className="flex-1 flex items-center gap-2">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="返信をポスト"
                    rows={1}
                    className="flex-1 text-[15px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] bg-transparent border-none outline-none resize-none py-1.5"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addReply() } }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement
                      t.style.height = 'auto'
                      t.style.height = t.scrollHeight + 'px'
                    }}
                  />
                  <button
                    onClick={addReply}
                    disabled={replying || !replyContent.trim()}
                    className="px-4 py-1.5 text-sm font-bold text-white bg-[var(--store-primary)] rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                  >
                    {replying ? '...' : '返信'}
                  </button>
                </div>
              </div>

              {/* ===== Replies (threaded) ===== */}
              <div>
                {selectedThread.replies.map((reply, idx) => (
                  <div key={reply.id} className="flex gap-3 px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)]">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <Avatar store={reply.store} size="sm" />
                      {idx < selectedThread.replies.length - 1 && (
                        <div className="w-0.5 flex-1 mt-1.5 bg-[var(--md-sys-color-outline-variant)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-bold text-[var(--md-sys-color-on-surface)] truncate">
                          {reply.store.name}
                        </span>
                        <span className="text-[13px] text-[var(--md-sys-color-outline)]">·</span>
                        <span className="text-[13px] text-[var(--md-sys-color-outline)] flex-shrink-0">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: false, locale: ja })}
                        </span>
                      </div>
                      <p className="text-[15px] text-[var(--md-sys-color-on-surface)] mt-0.5 whitespace-pre-wrap leading-relaxed">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={repliesEndRef} />
                {selectedThread.replies.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-sm text-[var(--md-sys-color-outline)]">まだ返信はありません</p>
                  </div>
                )}
              </div>

              {/* Bottom padding */}
              <div className="h-20" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
