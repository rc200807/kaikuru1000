'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import CommentSection, { type Comment } from '@/components/store/CommentSection'
import VideoThumbnail from '@/components/VideoThumbnail'

type RelatedVideo = {
  id: string
  title: string
  thumbnailUrl: string | null
  videoUrl: string
  categoryName: string
  viewed: boolean
  sameCategory: boolean
}

type VideoDetail = {
  id: string
  title: string
  description: string | null
  videoUrl: string
  thumbnailUrl: string | null
  summary: string | null
  summaryAt: string | null
  keyPoints: string[]
  publishedAt: string
  category: { id: string; name: string }
  liked: boolean
  likeCount: number
  favorited: boolean
  comments: Comment[]
  related: RelatedVideo[]
}

export default function StoreTrainingVideoDetailPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const videoId = params.id as string
  const [video, setVideo] = useState<VideoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewRecorded, setViewRecorded] = useState(false)
  const [started, setStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handlePlay() {
    // 1回の表示につき1回だけ記録（巻き戻し再生で多重カウントを避ける）
    if (viewRecorded || !videoId) return
    setViewRecorded(true)
    fetch(`/api/store/training-videos/${videoId}/view`, { method: 'POST' }).catch(() => {
      // 記録失敗しても再生体験は妨げない。次回のチャンスのため flag を戻す
      setViewRecorded(false)
    })
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated' && videoId) {
      setLoading(true)
      setViewRecorded(false)
      setStarted(false)
      fetch(`/api/store/training-videos/${videoId}`)
        .then(r => {
          if (!r.ok) { setNotFound(true); return null }
          return r.json()
        })
        .then(data => { if (data) { setVideo(data); setNotFound(false) } })
        .finally(() => setLoading(false))
    }
  }, [status, videoId])

  const toggleLike = async () => {
    if (!video) return
    // 楽観的更新
    const next = !video.liked
    setVideo({ ...video, liked: next, likeCount: video.likeCount + (next ? 1 : -1) })
    try {
      const r = await fetch(`/api/store/training-videos/${videoId}/like`, { method: 'POST' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setVideo(v => (v ? { ...v, liked: data.liked, likeCount: data.likeCount } : v))
    } catch {
      setVideo(v => (v ? { ...v, liked: !next, likeCount: v.likeCount + (next ? -1 : 1) } : v))
    }
  }

  const toggleFavorite = async () => {
    if (!video) return
    const next = !video.favorited
    setVideo({ ...video, favorited: next })
    try {
      const r = await fetch(`/api/store/training-videos/${videoId}/favorite`, { method: 'POST' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setVideo(v => (v ? { ...v, favorited: data.favorited } : v))
    } catch {
      setVideo(v => (v ? { ...v, favorited: !next } : v))
    }
  }

  const refreshDetail = async () => {
    const r = await fetch(`/api/store/training-videos/${videoId}`)
    if (r.ok) setVideo(await r.json())
  }

  const addComment = async (body: string) => {
    const r = await fetch(`/api/store/training-videos/${videoId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '送信に失敗しました') }
    refreshDetail()
  }

  const deleteComment = async (commentId: string) => {
    await fetch(`/api/store/training-videos/${videoId}/comments/${commentId}`, { method: 'DELETE' })
    refreshDetail()
  }

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  if (notFound || !video) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-[var(--md-sys-color-on-surface-variant)] mb-4">動画が見つかりません</p>
        <Link href="/store/training-videos" className="text-sm text-[var(--store-primary)] hover:underline">
          動画一覧に戻る
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 戻るリンク */}
      <Link
        href="/store/training-videos"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--store-primary)] transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        研修動画一覧
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* メインカラム */}
        <div className="min-w-0">
          {/* 動画プレーヤー */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-lg mb-4">
            <video
              ref={videoRef}
              src={video.videoUrl}
              controls
              className="w-full h-full"
              preload="metadata"
              poster={video.thumbnailUrl || undefined}
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={e => e.preventDefault()}
              onPlay={() => { setStarted(true); handlePlay() }}
            />
            {/* 再生前サムネイル（サムネ画像が無い動画はフレームを表示） */}
            {!started && !video.thumbnailUrl && (
              <button
                type="button"
                onClick={() => videoRef.current?.play()}
                className="absolute inset-0 w-full h-full group/play"
                aria-label="再生"
              >
                <VideoThumbnail thumbnailUrl={null} videoUrl={video.videoUrl} className="w-full h-full object-contain" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/play:bg-black/30 transition-colors">
                  <span className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover/play:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-[var(--store-primary)] ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* カテゴリ + タイトル */}
          <div className="mb-4">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)]">
              {video.category.name}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--md-sys-color-on-surface)] mt-2 leading-tight">
              {video.title}
            </h1>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
              {format(new Date(video.publishedAt), 'yyyy年M月d日公開', { locale: ja })}
            </p>
          </div>

          {/* アクション: Good・お気に入り */}
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={toggleLike}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                video.liked
                  ? 'border-[var(--store-primary)] bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                  : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
              aria-pressed={video.liked}
            >
              <svg className="w-5 h-5" fill={video.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M6.633 10.5H5.25m1.383 0c.055.194.084.4.084.612v6.376c0 .212-.03.418-.084.612m0-7.6L4.5 21m1.383-10.5H4.5" />
              </svg>
              <span>Good</span>
              <span className="tabular-nums">{video.likeCount}</span>
            </button>

            <button
              type="button"
              onClick={toggleFavorite}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                video.favorited
                  ? 'border-amber-400 bg-amber-400 text-white shadow-md'
                  : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
              aria-pressed={video.favorited}
            >
              <svg className="w-5 h-5" fill={video.favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
              <span>{video.favorited ? '保存済み' : '保存'}</span>
            </button>
          </div>

          {/* 説明 */}
          {video.description && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
              <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{video.description}</p>
            </div>
          )}

          {/* AI要約セクション */}
          {video.summary ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">AI要約</h2>
                  {video.summaryAt && (
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {format(new Date(video.summaryAt), 'yyyy年M月d日 生成', { locale: ja })}
                    </p>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200/50 dark:border-purple-800/30">
                <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap leading-relaxed">{video.summary}</p>
              </div>

              {video.keyPoints.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--store-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    重要ポイント
                  </h3>
                  <div className="space-y-2">
                    {video.keyPoints.map((point, i) => (
                      <div key={i} className="flex gap-3 px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary)] text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-relaxed">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-[var(--md-sys-color-surface-container)] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">この動画の要約はまだ作成されていません</p>
            </div>
          )}

          {/* コメント */}
          <div className="mt-8 pt-6 border-t border-[var(--md-sys-color-outline-variant)]">
            <CommentSection
              comments={video.comments}
              onAdd={addComment}
              onDelete={deleteComment}
              placeholder="この動画へのコメントを入力…"
            />
          </div>
        </div>

        {/* サイドバー: 関連動画 */}
        <aside className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">関連動画</h2>
          {video.related.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">他の動画はまだありません。</p>
          ) : (
            <div className="space-y-2">
              {video.related.map(rel => (
                <Link
                  key={rel.id}
                  href={`/store/training-videos/${rel.id}`}
                  className="flex gap-3 p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-container)] transition-colors group"
                >
                  {/* サムネイル */}
                  <div className="relative w-32 flex-shrink-0 aspect-video rounded-lg overflow-hidden bg-black">
                    <VideoThumbnail thumbnailUrl={rel.thumbnailUrl} videoUrl={rel.videoUrl} />
                    {rel.viewed && (
                      <span className="absolute bottom-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white shadow">✓</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] line-clamp-2 group-hover:text-[var(--store-primary)] transition-colors">
                      {rel.title}
                    </h3>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">{rel.categoryName}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>

      <div className="mt-10 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Link href="/store/training-videos" className="inline-flex items-center gap-1.5 text-sm text-[var(--store-primary)] hover:underline">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          研修動画一覧に戻る
        </Link>
      </div>
    </div>
  )
}
