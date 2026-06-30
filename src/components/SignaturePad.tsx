'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * 署名パッド（マウス・タッチ対応）。描画変更時に PNG data URL を onSignatureChange へ返す。
 * 売買契約書フローと案件詳細の事前同意で共有。
 */
export default function SignaturePad({
  onSignatureChange,
  initialDataUrl,
}: {
  onSignatureChange: (dataUrl: string | null) => void
  initialDataUrl?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(!!initialDataUrl)

  // マウント時に保存済み署名を復元
  useEffect(() => {
    if (!initialDataUrl || !canvasRef.current) return
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = initialDataUrl
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1C1B1F'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    if (!hasDrawn) setHasDrawn(true)
  }

  const endDraw = () => {
    setIsDrawing(false)
    if (hasDrawn && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onSignatureChange(null)
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[150px] cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-gray-400">ここに署名してください</span>
          </div>
        )}
      </div>
      {hasDrawn && (
        <button
          onClick={clearCanvas}
          className="mt-1 text-xs text-[var(--md-sys-color-error)] hover:underline"
        >
          署名をクリア
        </button>
      )}
    </div>
  )
}
