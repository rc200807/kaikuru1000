'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type BarcodeScannerProps = {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scannerRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const detectedRef = useRef(false)

  // 手動JANコード入力
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop()
      } catch {
        // ignore
      }
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function startScanner() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

        if (!mounted) return

        const scanner = new Html5Qrcode('barcode-reader', {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
        })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.5,
          },
          (decodedText: string) => {
            if (detectedRef.current) return
            // JANコードは数字のみ（8桁 or 13桁）
            const cleaned = decodedText.replace(/\D/g, '')
            if (/^\d{8}$|^\d{13}$/.test(cleaned)) {
              detectedRef.current = true
              onDetected(cleaned)
            }
          },
          () => {
            // ignore scan failures
          }
        )

        if (mounted) setScanning(true)
      } catch (err: any) {
        console.error('[BarcodeScanner] Error:', err)
        if (mounted) {
          if (err?.message?.includes('Permission') || err?.name === 'NotAllowedError') {
            setError('カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。')
          } else if (err?.message?.includes('NotFound') || err?.name === 'NotFoundError') {
            setError('カメラが見つかりません。')
          } else {
            setError('カメラの起動に失敗しました。手動入力をご利用ください。')
          }
          setShowManual(true)
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      stopScanner()
    }
  }, [onDetected, stopScanner])

  function handleManualSubmit() {
    const cleaned = manualCode.trim().replace(/\D/g, '')
    if (/^\d{8}$|^\d{13}$/.test(cleaned)) {
      onDetected(cleaned)
    } else {
      setError('JANコードは8桁または13桁の数字です')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--md-sys-color-surface)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              バーコードスキャン
            </h3>
          </div>
          <button
            onClick={() => { stopScanner(); onClose() }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
          >
            <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* カメラビュー */}
        <div className="relative">
          <div id="barcode-reader" className="w-full" style={{ minHeight: '280px' }} />
          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--md-sys-color-surface-container)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">カメラを起動中...</p>
              </div>
            </div>
          )}
          <video ref={videoRef} className="hidden" />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* ガイド */}
        <div className="px-4 py-3 space-y-3">
          {error && (
            <div className="p-2 rounded text-xs text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)]">
              {error}
            </div>
          )}

          {!showManual && scanning && (
            <p className="text-xs text-center text-[var(--md-sys-color-on-surface-variant)]">
              商品のバーコード（JANコード）をカメラに映してください
            </p>
          )}

          {/* 手動入力トグル */}
          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="w-full text-xs text-[var(--portal-primary)] hover:underline text-center py-1"
            >
              手動でJANコードを入力する
            </button>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">JANコード（手動入力）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={13}
                  value={manualCode}
                  onChange={(e) => { setManualCode(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
                  className="flex-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-3 py-2 bg-[var(--md-sys-color-surface-container-low)]"
                  placeholder="例: 4901234567890"
                  autoFocus
                />
                <button
                  onClick={handleManualSubmit}
                  className="px-4 py-2 text-sm font-medium rounded bg-[var(--portal-primary)] text-white hover:opacity-90 transition-opacity"
                >
                  検索
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
