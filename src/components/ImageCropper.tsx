'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { convertToJpegIfNeeded } from '@/lib/image-utils'

const VIEW = 280 // トリミング枠の一辺(px)
const OUTPUT = 512 // 出力画像の一辺(px)

/**
 * 正方形（丸アバター用）の画像トリミング。
 * ドラッグで位置調整・スライダーで拡大縮小し、確定でクロップ済み JPEG(File) を返す。
 * 依存ライブラリなし（canvas で書き出し）。
 */
export default function ImageCropper({
  file,
  onCropped,
  onCancel,
}: {
  file: File
  onCropped: (file: File, previewUrl: string) => void
  onCancel: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [baseScale, setBaseScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [processing, setProcessing] = useState(false)

  // HEIC等を JPEG に変換して読み込む
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    ;(async () => {
      const jpeg = await convertToJpegIfNeeded(file)
      url = URL.createObjectURL(jpeg)
      if (!cancelled) setSrc(url)
    })()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [file])

  const scale = baseScale * zoom

  const clamp = useCallback((o: { x: number; y: number }, s: number, w: number, h: number) => {
    const minX = VIEW - w * s
    const minY = VIEW - h * s
    return { x: Math.min(0, Math.max(minX, o.x)), y: Math.min(0, Math.max(minY, o.y)) }
  }, [])

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    imgRef.current = img
    const w = img.naturalWidth, h = img.naturalHeight
    const bs = Math.max(VIEW / w, VIEW / h) // カバー
    setNat({ w, h })
    setBaseScale(bs)
    setZoom(1)
    const s = bs
    setOffset({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 })
  }

  // ズーム変更時、中心を保ったまま拡大縮小
  const handleZoom = (z: number) => {
    if (!nat) return
    const prevS = baseScale * zoom
    const nextS = baseScale * z
    const cx = VIEW / 2, cy = VIEW / 2
    const ix = (cx - offset.x) / prevS
    const iy = (cy - offset.y) / prevS
    const nx = cx - ix * nextS
    const ny = cy - iy * nextS
    setZoom(z)
    setOffset(clamp({ x: nx, y: ny }, nextS, nat.w, nat.h))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !nat) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(clamp({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }, scale, nat.w, nat.h))
  }
  const onPointerUp = () => { dragRef.current = null }

  const confirm = async () => {
    if (!imgRef.current || !nat) return
    setProcessing(true)
    try {
      const k = OUTPUT / VIEW
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas unavailable')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, OUTPUT, OUTPUT)
      ctx.drawImage(imgRef.current, offset.x * k, offset.y * k, nat.w * scale * k, nat.h * scale * k)
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9),
      )
      const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      onCropped(cropped, URL.createObjectURL(blob))
    } catch {
      alert('画像の処理に失敗しました')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
        ドラッグで位置を調整、スライダーで拡大縮小できます
      </p>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'relative',
          width: VIEW,
          height: VIEW,
          overflow: 'hidden',
          borderRadius: 12,
          background: '#000',
          touchAction: 'none',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async"
            src={src}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: nat ? nat.w * scale : 'auto',
              height: nat ? nat.h * scale : 'auto',
              maxWidth: 'none',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* 丸マスクのプレビュー */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.8)', borderRadius: '50%', pointerEvents: 'none' }} />
      </div>

      <input
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={(e) => handleZoom(Number(e.target.value))}
        style={{ width: VIEW }}
        aria-label="拡大縮小"
      />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
        <button type="button" onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: 'pointer' }}>
          やり直す
        </button>
        <button type="button" onClick={confirm} disabled={processing || !nat} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--store-primary, #b91c1c)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: processing || !nat ? 0.5 : 1 }}>
          {processing ? '処理中…' : 'この位置で確定'}
        </button>
      </div>
    </div>
  )
}
