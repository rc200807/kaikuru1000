'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import { getYoutubeEmbedUrl, getYoutubeThumbnail } from '@/lib/youtube-utils'

type Video = {
  id: string
  title: string
  description: string | null
  youtubeUrl: string
  publishedAt: string
}

type CategoryWithVideos = {
  id: string
  name: string
  videos: Video[]
}

export default function StoreTrainingVideosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryWithVideos[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)

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

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  const allVideos = categories.flatMap(c => c.videos.map(v => ({ ...v, categoryName: c.name })))
  const filteredCategories = activeCategory === 'all'
    ? categories
    : categories.filter(c => c.id === activeCategory)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">
          研修動画
        </h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          本部が配信する研修・教育コンテンツ
        </p>
      </div>

      {/* プレーヤーモーダル */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPlayingVideo(null)} />
          <div className="relative w-full max-w-4xl z-10">
            <button
              onClick={() => setPlayingVideo(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm flex items-center gap-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              閉じる
            </button>
            <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl">
              <iframe
                src={getYoutubeEmbedUrl(playingVideo.youtubeUrl) + '?autoplay=1'}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="mt-4">
              <h2 className="text-lg font-bold text-white">{playingVideo.title}</h2>
              {playingVideo.description && (
                <p className="text-sm text-white/70 mt-1 whitespace-pre-wrap">{playingVideo.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {allVideos.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          }
          title="研修動画はまだありません"
          description="本部が動画を配信するとここに表示されます"
        />
      ) : (
        <>
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

          {/* カテゴリごとの動画一覧 */}
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
                  {cat.videos.map(video => {
                    const thumb = getYoutubeThumbnail(video.youtubeUrl)
                    return (
                      <button
                        key={video.id}
                        onClick={() => setPlayingVideo(video)}
                        className="text-left rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden hover:border-[var(--store-primary)] hover:shadow-lg transition-all group"
                      >
                        {/* サムネイル */}
                        <div className="relative aspect-video bg-black">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[var(--md-sys-color-surface-container)]">
                              <svg className="w-12 h-12 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                              </svg>
                            </div>
                          )}
                          {/* 再生オーバーレイ */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <svg className="w-7 h-7 text-[var(--store-primary)] ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2 group-hover:text-[var(--store-primary)] transition-colors">
                            {video.title}
                          </h3>
                          {video.description && (
                            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                              {video.description}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
