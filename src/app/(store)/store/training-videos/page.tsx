'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import VideoThumbnail from '@/components/VideoThumbnail'

type Video = {
  id: string
  title: string
  description: string | null
  videoUrl: string
  thumbnailUrl: string | null
  fileSize: number | null
  publishedAt: string
  viewed: boolean
  playCount: number
  lastViewedAt: string | null
  favorited: boolean
  likeCount: number
}

type CategoryWithVideos = {
  id: string
  name: string
  videos: Video[]
}

export default function StoreTrainingVideosPage() {
  const { status } = useSession()
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryWithVideos[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/store/training-videos')
        .then(r => r.json())
        .then(setCategories)
        .finally(() => setLoading(false))
    }
  }, [status])

  // お気に入りトグル（楽観的更新）
  const toggleFavorite = async (videoId: string, next: boolean) => {
    setCategories(prev =>
      prev.map(c => ({
        ...c,
        videos: c.videos.map(v => (v.id === videoId ? { ...v, favorited: next } : v)),
      })),
    )
    try {
      const r = await fetch(`/api/store/training-videos/${videoId}/favorite`, { method: 'POST' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setCategories(prev =>
        prev.map(c => ({
          ...c,
          videos: c.videos.map(v => (v.id === videoId ? { ...v, favorited: data.favorited } : v)),
        })),
      )
    } catch {
      // 失敗したら元に戻す
      setCategories(prev =>
        prev.map(c => ({
          ...c,
          videos: c.videos.map(v => (v.id === videoId ? { ...v, favorited: !next } : v)),
        })),
      )
    }
  }

  const allVideos = useMemo(
    () => categories.flatMap(c => c.videos.map(v => ({ ...v, categoryName: c.name }))),
    [categories],
  )
  const favoriteCount = useMemo(() => allVideos.filter(v => v.favorited).length, [allVideos])

  const q = search.trim().toLowerCase()
  const matchesSearch = (v: Video) =>
    !q ||
    v.title.toLowerCase().includes(q) ||
    (v.description ?? '').toLowerCase().includes(q)

  // 検索中・お気に入りフィルタ中はフラットなグリッド表示、それ以外はカテゴリ別表示
  const isFlat = q !== '' || activeCategory === 'favorites'
  const flatVideos = allVideos.filter(v => {
    if (activeCategory === 'favorites' && !v.favorited) return false
    return matchesSearch(v)
  })
  const filteredCategories = (activeCategory === 'all'
    ? categories
    : categories.filter(c => c.id === activeCategory)
  )
    .map(c => ({ ...c, videos: c.videos.filter(matchesSearch) }))
    .filter(c => c.videos.length > 0)

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">研修動画</h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          本部が配信する研修・教育コンテンツ
        </p>
      </div>

      {allVideos.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
          title="研修動画はまだありません"
          description="本部が動画を配信するとここに表示されます"
        />
      ) : (
        <>
          {/* 検索バー */}
          <div className="relative mb-4">
            <svg className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="動画を検索（タイトル・説明）"
              className="w-full h-12 pl-11 pr-10 rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)] focus:ring-2 focus:ring-[var(--store-primary)]/20 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                aria-label="検索をクリア"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* カテゴリフィルター */}
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === 'all'
                  ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                  : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
            >
              すべて ({allVideos.length})
            </button>
            <button
              onClick={() => setActiveCategory('favorites')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all inline-flex items-center gap-1.5 ${
                activeCategory === 'favorites'
                  ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                  : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
              お気に入り ({favoriteCount})
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === c.id
                    ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                {c.name} ({c.videos.length})
              </button>
            ))}
          </div>

          {/* 検索・お気に入りフィルタ時はフラット表示 */}
          {isFlat ? (
            flatVideos.length === 0 ? (
              <EmptyState
                icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>}
                title={activeCategory === 'favorites' ? 'お気に入りの動画はまだありません' : '該当する動画が見つかりません'}
                description={activeCategory === 'favorites' ? '動画の☆を押すとお気に入りに追加できます' : '別のキーワードでお試しください'}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {flatVideos.map(video => (
                  <VideoCard key={video.id} video={video} onToggleFavorite={toggleFavorite} />
                ))}
              </div>
            )
          ) : (
            <div className="space-y-8">
              {filteredCategories.map(cat => (
                <div key={cat.id}>
                  <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-[var(--store-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    {cat.name}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.videos.map(video => (
                      <VideoCard key={video.id} video={video} onToggleFavorite={toggleFavorite} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 動画カード（サムネイル＋お気に入りトグル＋いいね数） */
function VideoCard({
  video,
  onToggleFavorite,
}: {
  video: Video
  onToggleFavorite: (id: string, next: boolean) => void
}) {
  return (
    <Link
      href={`/store/training-videos/${video.id}`}
      className="block rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden hover:border-[var(--store-primary)] hover:shadow-lg transition-all group"
    >
      {/* サムネイル */}
      <div className="relative aspect-video bg-black">
        <VideoThumbnail thumbnailUrl={video.thumbnailUrl} videoUrl={video.videoUrl} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <svg className="w-7 h-7 text-[var(--store-primary)] ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
        {/* お気に入りトグル（☆） */}
        <button
          type="button"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onToggleFavorite(video.id, !video.favorited)
          }}
          className={`absolute top-2 left-2 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all ${
            video.favorited
              ? 'bg-amber-400 text-white'
              : 'bg-black/40 text-white hover:bg-black/60'
          }`}
          aria-label={video.favorited ? 'お気に入りを解除' : 'お気に入りに追加'}
          title={video.favorited ? 'お気に入りを解除' : 'お気に入りに追加'}
        >
          <svg className="w-5 h-5" fill={video.favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
          </svg>
        </button>
        {/* 視聴ステータスバッジ */}
        <span
          className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-full shadow-md ${
            video.viewed ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {video.viewed ? '✓ 閲覧済み' : '未閲覧'}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2 group-hover:text-[var(--store-primary)] transition-colors">
          {video.title}
        </h3>
        {video.description && (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">{video.description}</p>
        )}
        {video.likeCount > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.977a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507C2.28 19.482 3.105 20 3.994 20H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.477Z" /></svg>
            {video.likeCount}
          </div>
        )}
      </div>
    </Link>
  )
}
