'use client'

import { useRef } from 'react'

/**
 * 動画サムネイル表示。
 * - thumbnailUrl があればその画像を表示
 * - 無ければ動画自身の先頭付近フレームを表示（黒画面を避けるため metadata 読込後に seek）
 * - どちらも無ければアイコンのプレースホルダ
 */
export default function VideoThumbnail({
  thumbnailUrl,
  videoUrl,
  className = 'w-full h-full object-cover',
  frameTime = 1,
}: {
  thumbnailUrl?: string | null
  videoUrl?: string | null
  className?: string
  frameTime?: number
}) {
  const seekedRef = useRef(false)

  if (thumbnailUrl) {
    return <img loading="lazy" decoding="async" src={thumbnailUrl} alt="" className={className} />
  }

  if (videoUrl) {
    return (
      <video
        src={`${videoUrl}#t=${frameTime}`}
        className={className}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden
        // ダウンロード抑止（一覧のフレーム表示でも右クリック保存を防ぐ）
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={e => e.preventDefault()}
        onLoadedMetadata={e => {
          if (seekedRef.current) return
          const v = e.currentTarget
          const d = v.duration
          const target = isFinite(d) && d > 0 ? Math.min(frameTime, d / 2) : frameTime
          try {
            v.currentTime = target
            seekedRef.current = true
          } catch {
            /* seek 不可でも先頭フレームが表示される */
          }
        }}
      />
    )
  }

  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 ${className}`}>
      <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    </div>
  )
}
