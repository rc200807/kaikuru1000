'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'

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
}

export default function StoreTrainingVideoDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [video, setVideo] = useState<VideoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewRecorded, setViewRecorded] = useState(false)

  function handlePlay() {
    // 1回の表示につき1回だけ記録（巻き戻し再生で多重カウントを避ける）
    if (viewRecorded || !params.id) return
    setViewRecorded(true)
    fetch(`/api/store/training-videos/${params.id}/view`, { method: 'POST' }).catch(() => {
      // 記録失敗しても再生体験は妨げない。次回のチャンスのため flag を戻す
      setViewRecorded(false)
    })
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated' && params.id) {
      fetch(`/api/store/training-videos/${params.id}`)
        .then(r => {
          if (!r.ok) { setNotFound(true); return null }
          return r.json()
        })
        .then(data => { if (data) setVideo(data) })
        .finally(() => setLoading(false))
    }
  }, [status, params.id])

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
    <div className="max-w-4xl mx-auto px-4 py-6">
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

      {/* 動画プレーヤー */}
      <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg mb-6">
        <video
          src={video.videoUrl}
          controls
          className="w-full h-full"
          preload="metadata"
          poster={video.thumbnailUrl || undefined}
          controlsList="nodownload"
          onPlay={handlePlay}
        />
      </div>

      {/* 説明 */}
      {video.description && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
          <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{video.description}</p>
        </div>
      )}

      {/* AI要約セクション */}
      {video.summary && (
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
      )}

      {!video.summary && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-[var(--md-sys-color-surface-container)] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">この動画の要約はまだ作成されていません</p>
        </div>
      )}

      <div className="mt-10 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Link href="/store/training-videos" className="inline-flex items-center gap-1.5 text-sm text-[var(--store-primary)] hover:underline">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          研修動画一覧に戻る
        </Link>
      </div>
    </div>
  )
}
