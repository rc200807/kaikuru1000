'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { QRCodeSVG } from 'qrcode.react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

/* ─── PINロック解除モーダル ─── */
function PinUnlockModal({
  open,
  onUnlock,
  onCancel,
}: {
  open: boolean
  onUnlock: () => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleVerify = async () => {
    if (!pin) return
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/store/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.valid) {
        onUnlock()
      } else {
        setError('暗証番号が正しくありません')
        setPin('')
        inputRef.current?.focus()
      }
    } catch {
      setError('検証に失敗しました')
    } finally {
      setVerifying(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--md-sys-color-surface)] rounded-2xl shadow-xl w-[min(90vw,360px)] p-6 space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--portal-primary)]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">画面ロック</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
            暗証番号を入力してロックを解除してください
          </p>
        </div>

        <div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
            placeholder="暗証番号（4〜6桁）"
            className="w-full px-4 py-3 text-center text-lg tracking-[0.5em] rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/50 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
          />
          {error && (
            <p className="text-xs text-[var(--md-sys-color-error)] mt-2 text-center">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] rounded-xl hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleVerify}
            disabled={pin.length < 4 || verifying}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[var(--portal-primary)] rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {verifying ? '確認中...' : '解除'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── 型定義 ─── */
type PurchaseItem = {
  id: string
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
}

type WorkItem = {
  id: string
  workName: string
  unitPrice: number
  quantity: number
}

type VisitDetail = {
  id: string
  visitDate: string
  status: string
  note: string | null
  user: { id: string; name: string; address: string; phone: string; email?: string; idAddress?: string | null; idName?: string | null }
  store: { id: string; name: string; address?: string | null; phone?: string | null }
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
}

type ExistingContract = {
  id: string
  agreedAt: string
  emailSentAt: string | null
  customerEmail: string | null
}

/* ─── 手書きサインパッド ─── */
function SignaturePad({
  onSignatureChange,
}: {
  onSignatureChange: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

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

/* ─── メイン ─── */
export default function AgreementPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const scheduleId = params.id as string
  const staffName = searchParams.get('staff') || ''

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [signature, setSignature] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [existingContract, setExistingContract] = useState<ExistingContract | null>(null)
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const contractRef = useRef<HTMLDivElement>(null)

  // PIN lock state
  const [pinLocked, setPinLocked] = useState(true)
  const [hasPin, setHasPin] = useState<boolean | null>(null) // null = loading
  const [showPinModal, setShowPinModal] = useState(false)
  const pendingNavigationRef = useRef<string | null>(null)

  // PINの有無を取得
  useEffect(() => {
    fetch('/api/store/lock-pin')
      .then(r => r.json())
      .then(data => {
        setHasPin(data.hasPin)
        if (!data.hasPin) setPinLocked(false) // PIN未設定ならロックなし
      })
      .catch(() => {
        setHasPin(false)
        setPinLocked(false)
      })
  }, [])

  // beforeunload: タブ閉じ・リロード防止
  useEffect(() => {
    if (!pinLocked) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pinLocked])

  // ブラウザ戻るボタンの制御
  useEffect(() => {
    if (!pinLocked) return
    // 履歴にダミーエントリを追加して戻るボタンをキャッチ
    window.history.pushState(null, '', window.location.href)
    const handler = () => {
      window.history.pushState(null, '', window.location.href)
      setShowPinModal(true)
      pendingNavigationRef.current = `/store/schedule/${scheduleId}`
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [pinLocked, scheduleId])

  // ロック中のナビゲーションをラップ
  const navigateWithPinCheck = useCallback((href: string) => {
    if (pinLocked) {
      pendingNavigationRef.current = href
      setShowPinModal(true)
    } else {
      router.push(href)
    }
  }, [pinLocked, router])

  const handlePinUnlock = useCallback(() => {
    setPinLocked(false)
    setShowPinModal(false)
    if (pendingNavigationRef.current) {
      const dest = pendingNavigationRef.current
      pendingNavigationRef.current = null
      router.push(dest)
    }
  }, [router])

  const fetchVisit = useCallback(async () => {
    const [visitRes, contractRes] = await Promise.all([
      fetch(`/api/visit-schedules/${scheduleId}`),
      fetch(`/api/visit-schedules/${scheduleId}/contract`),
    ])
    if (visitRes.ok) {
      const data = await visitRes.json()
      setVisit(data)
    }
    if (contractRes.ok) {
      const contract = await contractRes.json()
      setExistingContract(contract)
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => {
    if (session) fetchVisit()
  }, [session, fetchVisit])

  const generateMagicLink = useCallback(async () => {
    if (!visit) return
    setMagicLinkLoading(true)
    try {
      const res = await fetch('/api/magic-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: visit.user.id, contractId: scheduleId }),
      })
      if (res.ok) {
        const data = await res.json()
        setMagicLinkUrl(data.url)
      }
    } catch (e) {
      console.error('マジックリンク生成エラー:', e)
    } finally {
      setMagicLinkLoading(false)
    }
  }, [visit, scheduleId])

  const fmtYen = (n: number) => `¥${n.toLocaleString()}`

  const purchaseTotal = visit?.purchaseItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0) ?? 0
  const workTotal = visit?.workItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) ?? 0

  const handleSubmit = async () => {
    if (!agreed || !signature || !visit) return
    setSubmitting(true)
    setMessage(null)

    try {
      // jsPDF + html2canvas でPDF生成
      let pdfBase64: string | null = null
      try {
        const { default: jsPDF } = await import('jspdf')
        const { default: html2canvas } = await import('html2canvas')

        if (contractRef.current) {
          const canvas = await html2canvas(contractRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          })

          const imgData = canvas.toDataURL('image/jpeg', 0.95)
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          const pageWidth = pdf.internal.pageSize.getWidth()
          const pageHeight = pdf.internal.pageSize.getHeight()
          const imgWidth = pageWidth - 20 // 左右10mmずつ余白
          const imgHeight = (canvas.height * imgWidth) / canvas.width

          let yOffset = 10
          let remainingHeight = imgHeight
          let sourceY = 0

          while (remainingHeight > 0) {
            const printHeight = Math.min(remainingHeight, pageHeight - 20)
            const sourceHeight = (printHeight / imgHeight) * canvas.height

            const pageCanvas = document.createElement('canvas')
            pageCanvas.width = canvas.width
            pageCanvas.height = sourceHeight
            const ctx = pageCanvas.getContext('2d')!
            ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)

            const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95)
            pdf.addImage(pageImgData, 'JPEG', 10, yOffset, imgWidth, printHeight)

            remainingHeight -= printHeight
            sourceY += sourceHeight

            if (remainingHeight > 0) {
              pdf.addPage()
              yOffset = 10
            }
          }

          // base64取得（data:application/pdf;base64, の部分を除去）
          const pdfDataUrl = pdf.output('datauristring')
          pdfBase64 = pdfDataUrl.split(',')[1]
        }
      } catch (pdfErr) {
        console.error('PDF生成エラー:', pdfErr)
        // PDF生成失敗でも契約保存は続行
      }

      // API送信（契約保存 + メール送信）
      const res = await fetch(`/api/visit-schedules/${scheduleId}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData: signature, pdfBase64 }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '送信に失敗しました')
      }

      const result = await res.json()

      // 成功処理
      await fetchVisit() // 既存契約情報を更新

      if (result.emailSent) {
        setMessage({ type: 'success', text: `売買契約書を保存し、${visit.user.name}様にメールで送信しました。` })
      } else {
        setMessage({ type: 'success', text: '売買契約書を保存しました。（メール設定が未構成のためメール送信はスキップされました）' })
      }

      // マジックリンク自動生成
      generateMagicLink()

      // PDFダウンロード
      if (pdfBase64) {
        const link = document.createElement('a')
        link.href = `data:application/pdf;base64,${pdfBase64}`
        const visitDateStr = format(new Date(visit.visitDate), 'yyyyMMdd', { locale: ja })
        link.download = `売買契約書_${visit.user.name}_${visitDateStr}.pdf`
        link.click()
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? '送信に失敗しました' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="p-6">
        <MessageBanner severity="error">訪問スケジュールが見つかりません</MessageBanner>
        <Button variant="text" onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy年M月d日', { locale: ja })
  const coolingOffEnd = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy年M月d日（E）', { locale: ja })

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      {/* PINロックモーダル */}
      <PinUnlockModal
        open={showPinModal}
        onUnlock={handlePinUnlock}
        onCancel={() => {
          setShowPinModal(false)
          pendingNavigationRef.current = null
        }}
      />

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)}
          className="text-[var(--portal-primary)] hover:underline text-sm"
        >
          ← 訪問詳細
        </button>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] flex-1">売買契約書</h1>
        {pinLocked && (
          <button
            onClick={() => {
              pendingNavigationRef.current = null
              setShowPinModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--portal-primary)]/10 text-[var(--portal-primary)] hover:bg-[var(--portal-primary)]/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            ロック解除
          </button>
        )}
      </div>

      {/* 既存契約バナー */}
      {existingContract && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 text-xs text-green-800 dark:text-green-200">
          <p className="font-semibold mb-0.5">契約書記録あり</p>
          <p>
            同意日時: {format(new Date(existingContract.agreedAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
            {existingContract.emailSentAt && (
              <span className="ml-2">
                ・メール送信済: {format(new Date(existingContract.emailSentAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
              </span>
            )}
          </p>
        </div>
      )}

      {message && (
        <MessageBanner severity={message.type}>{message.text}</MessageBanner>
      )}

      {/* ──── 顧客用マジックリンク ──── */}
      {existingContract && (
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-2">お客様用 マイページリンク</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            このQRコードをお客様に読み取ってもらうと、契約内容をマイページで確認できます
          </p>

          {magicLinkUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-xl border border-[var(--md-sys-color-outline-variant)]">
                <QRCodeSVG value={magicLinkUrl} size={200} />
              </div>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] max-w-full break-all text-center select-all px-2">
                {magicLinkUrl}
              </p>
              <Button
                variant="outlined"
                onClick={() => {
                  navigator.clipboard.writeText(magicLinkUrl)
                  setMessage({ type: 'success', text: 'リンクをコピーしました' })
                }}
              >
                リンクをコピー
              </Button>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                このリンクは72時間有効です
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {magicLinkLoading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="w-4 h-4 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
                  マジックリンクを生成中...
                </div>
              ) : (
                <Button
                  variant="outlined"
                  onClick={generateMagicLink}
                >
                  マジックリンクを生成
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ──── PDF出力対象エリア ──── */}
      <div ref={contractRef} className="space-y-5 bg-white p-1 rounded-xl">

        {/* ──── 取引内容 ──── */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">取引内容</h2>

          {/* 基本情報 */}
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4 pb-4 border-b border-[var(--md-sys-color-outline-variant)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 日付 */}
              <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-1">
                <div><span className="font-medium">日付:</span> {today}</div>
                <div><span className="font-medium">訪問日:</span> {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}</div>
              </div>
              {/* お客様情報 */}
              <div className="space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
                <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">お客様情報</div>
                <div><span className="font-medium">氏名:</span> {visit.user.idName || visit.user.name}</div>
                <div><span className="font-medium">住所:</span> {visit.user.idAddress || visit.user.address}</div>
                <div><span className="font-medium">電話:</span> {visit.user.phone}</div>
              </div>
              {/* 店舗情報 */}
              <div className="space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
                <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">店舗情報</div>
                <div><span className="font-medium">店舗名:</span> {visit.store.name}</div>
                {visit.store.address && <div><span className="font-medium">住所:</span> {visit.store.address}</div>}
                {visit.store.phone && <div><span className="font-medium">電話:</span> {visit.store.phone}</div>}
                {staffName && <div><span className="font-medium">担当者:</span> {staffName}</div>}
              </div>
            </div>
          </div>

          {/* 買取品目 */}
          {visit.purchaseItems.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">買取品目</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                    <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">品名</th>
                    <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">カテゴリー</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.purchaseItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                      <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.itemName}</td>
                      <td className="py-1.5 text-[var(--md-sys-color-on-surface-variant)]">{item.category}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{item.quantity}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{fmtYen(item.purchasePrice)}</td>
                      <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(item.purchasePrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">買取金額合計</td>
                    <td className="py-2 text-right font-bold text-lg text-[var(--portal-primary)]">{fmtYen(purchaseTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 作業品目 */}
          {visit.workItems.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">作業品目</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                    <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">作業名</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                    <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.workItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                      <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.workName}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{item.quantity}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{fmtYen(item.unitPrice)}</td>
                      <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">作業費合計</td>
                    <td className="py-2 text-right font-bold text-lg text-[var(--md-sys-color-on-surface)]">{fmtYen(workTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 差引金額 */}
          <div className="mt-4 pt-4 border-t-2 border-[var(--portal-primary)] flex justify-between items-center">
            <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">お支払い金額（買取額 - 作業費）</span>
            <span className="text-xl font-bold text-[var(--portal-primary)]">{fmtYen(purchaseTotal - workTotal)}</span>
          </div>
        </Card>

        {/* ──── 特商法書面・クーリングオフ全文 ──── */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4">特定商取引法に基づく書面</h2>
          <div className="space-y-4">

            {/* 冒頭（赤文字） */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-red-50">
              <p className="text-xs text-red-700 leading-relaxed">
                本書面は、特定商取引法（以下「特商法」といいます。）第58条の8に基づき交付する書面です。重要な内容が記載されておりますので、内容を十分にお読みください。また、本件の個人情報については、個人情報保護法及び買いクルのプライバシーポリシーに従って取り扱います。
              </p>
            </div>

            {/* 個人情報保護方針 */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-high)]">
              <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-2">■個人情報保護方針</p>
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-2 leading-relaxed">
                <p>収集する個人情報について、個人情報保護方針に即して必要な対策を講じて適切に管理致します。</p>
                <div>
                  <p className="font-semibold text-[var(--md-sys-color-on-surface)]">1. 取得する個人情報</p>
                  <p>当社は、後記「2. 個人情報の利用目的」に定める目的のため、本売買契約のご契約者様（以下「お客様」といいます。）に関して以下に定める個人情報を取得致します。</p>
                  <ul className="mt-1 space-y-0.5 pl-2">
                    <li>・お客様の氏名、住所、生年月日、連絡先、メールアドレス、ご職業、本人確認書類の写し</li>
                    <li>・本売買契約における品名、品目数、単価、金額、売買契約の締結日時</li>
                    <li>・お客様から当社へのお問合せ、ご連絡等に関する情報</li>
                    <li>・その他本売買契約の記載事項</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-[var(--md-sys-color-on-surface)]">2. 利用目的</p>
                  <p>当社は、取得した個人情報を以下の目的の範囲内で利用致します。なお、以下の目的に関連する目的についても含まれるものとします。</p>
                  <ul className="mt-1 space-y-0.5 pl-2">
                    <li>・商品の配送及び発送並びにアフターサービスに関するご連絡</li>
                    <li>・買取商品に関するご連絡</li>
                    <li>・新商品のご提案やサービスのご案内に関するご連絡</li>
                    <li>・法令に基づき開示することが必要である場合</li>
                  </ul>
                </div>
                <p>3. 当社では取得した個人情報を、上記「2. 利用目的」の範囲内において、株式会社RC または「買いクル」フランチャイズ加盟店に提供する場合がございます。</p>
                <p>4. 当社は、事業運営上、お客様により良いサービスを提供するために業務の一部を外部に委託しています。その一環として、業務委託先に対し、上記「2. 利用目的」の達成に必要な範囲内において個人情報を提供することがあります。この場合、個人情報を適切に取り扱っていると認められる委託先を選定し、契約等において個人情報の適正管理・機密保持などによりお客様の個人情報の漏洩防止に必要な事項を取決め、適切な管理を実施させます。</p>
              </div>
            </div>

            {/* クーリング・オフについて（赤文字） */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-red-50">
              <p className="text-xs font-bold text-red-700 mb-2">■クーリング・オフについて</p>
              <div className="text-xs text-red-700 space-y-2 leading-relaxed">
                <p>1. お客様が、訪問買取で本売買契約をご契約された場合、本書面を受け取った日から8日を経過するまでの間は書面または電磁的方法により本売買契約のクーリング・オフ（契約の解除）ができます。ただし、当該売買契約の相手方の利益を損なうおそれがないと認められる物品または特商法の適用を受けることとされた場合に流通が著しく害されるおそれがあると認められる物品であって、政令で定める物品（自動車・家庭用電気機械器具（携行が容易なものを除く。）・家具・書籍・有価証券・レコード、CD、ゲームソフト等）は対象外になります。</p>
                <p>2. クーリング・オフの効力は、書面または電磁的記録による通知を発信したとき（郵便消印日付など）から発生し、第三者に対しても対抗することができます。ただし、第三者がクーリング・オフにつき善意であり、かつ、過失がないときは、クーリング・オフの効力を当該第三者に対抗することはできません。</p>
                <p>3. お客様がクーリング・オフをした場合で、お客様が本売買契約の目的物である物品を購入業者（購入店舗）に既に引き渡していた場合には、速やかに物品を返却致します。</p>
                <p>4. お客様がクーリング・オフをした場合、契約書に「キャンセル料」や「違約金」について書かれていても、お客様が損害賠償及び違約金の支払を請求されることは一切ありません。</p>
                <p>5. 訪問購入の場合、お客様が購入業者（購入店舗）から受け取った代金を返還する際にかかる費用は、購入業者（購入店舗）の負担となります。</p>
                <p>6. お客様のクーリング・オフの行使を妨げるために購入業者が不実のことを告げ、そのためお客様が誤解し、または脅迫によりクーリング・オフを行わなかった場合には、当該購入業者（購入店舗）が交付したクーリング・オフ妨害の解消のための書面を受領した日から8日が経過するまでは、書面または電磁的記録によりクーリング・オフをすることができます。</p>
                <p className="font-semibold mt-1">本書面受領日（{today}）からクーリング・オフ期限: <strong>{coolingOffEnd}</strong></p>
              </div>
            </div>

            {/* クーリング・オフの書き方 */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-high)]">
              <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-2">■クーリング・オフの書き方</p>
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1.5 leading-relaxed">
                <p>1. ハガキ等の書面または電子メール等の電磁的記録で行います。</p>
                <p>2. 下記の項目を記載してください。</p>
                <ul className="pl-4 space-y-0.5">
                  <li>(1) お客様（受取人）の住所及び氏名</li>
                  <li>(2) 契約（申込）日</li>
                  <li>(3) 購入業者名（購入店舗）及びその住所</li>
                  <li>(4) 担当者名</li>
                  <li>(5) 物品名</li>
                  <li>(6) 契約金額</li>
                  <li>(7) 契約を解除する旨</li>
                </ul>
                <p>3. ハガキ等の書面による方法の場合、そのコピーを作成いただくことを推奨致します。</p>
                <p>4. ハガキ等の書面による方法の場合、郵便局の窓口で、簡易書留等の「出した日付」がわかる方法で購入業者（購入店舗宛）に提出いただくことが確実です。</p>
                <p>5. ハガキ等の書面による方法の場合、コピーや簡易書留のお問合せ番号等を保存することを推奨致します（この2つがクーリング・オフをしたことの証拠になります）。また、電磁的記録による場合、当該電磁的記録を保存することを推奨致します。</p>
              </div>
            </div>

            {/* 物品の引渡拒絶についての規定（赤文字） */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-red-50">
              <p className="text-xs font-bold text-red-700 mb-2">■物品の引渡拒絶についての規定</p>
              <p className="text-xs text-red-700 leading-relaxed">
                お客様が、訪問買取で本売買契約をご契約された場合で、後日物品の引き渡しを行うときには、上記「■クーリング・オフについて」のうち「1.」または「6.」に定めるいわゆるクーリング・オフ期間の間は、物品の引き渡しの拒絶が可能です。
              </p>
            </div>

            {/* 買取時の確認事項 */}
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-high)]">
              <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-2">■買取時の確認事項</p>
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1.5 leading-relaxed">
                <p>1. 申込時の電話案内にて特定された品種以外の不意打ち的な勧誘行為を受けておりません。</p>
                <p>2. 今回の商談で、しつこい押し買い行為、虚偽言動、強制的な売買の勧誘といった迷惑を覚えるような勧誘を受けていません。</p>
                <p>3. 搬出時、無償での作業支援で発生した物品や建物への破損、損害については一切の責任を負いかねることに同意します。</p>
                <p>4. 特商法58条の17に規定する事由にあたる場合（お客様による来訪請求の場合、お客様がお住まいから退去する場合など）、クーリング・オフ適用外取引となりますので、一切の返品はできないことを認識しました。</p>
                <p>5. 買取または引取をした物品が故障・破損している場合（当該物品の部品が足りていない場合を含む。）、買取時にお客様から事実と異なる虚偽の申告があった場合、または当該物品が贋作であることが判明した場合には、購入業者が物品を返品の上、お客様に買取代金をご返金いただくことを認識しました。</p>
                <p>6. 反社会勢力ではないことの誓約<br />私は、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動標榜ゴロまたは特殊知能暴力団等、その他これに準ずる者（以下「反社会的勢力」といいます。）のいずれでもなく、また、反社会勢力が経営に実質的に関与している法人等に属する者ではないことを表明し、かつ将来にわたっても該当しないことを誓約します。私が、反社会勢力に該当すると認められるときは、何らの通知・催告をすることなしに、本件売買契約を解除されること及び私に損害が生じたとしても賠償請求できないことを了承します。</p>
              </div>
            </div>

            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] text-center">
              本書面は、買取申込書と一体として、売買契約書になるものです。大事に保管下さい。
            </p>
          </div>
        </Card>

        {/* ──── 同意と署名 ──── */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">同意と署名</h2>

          <div className="space-y-4">
            {/* 同意チェックボックス */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[var(--md-sys-color-outline)] accent-[var(--portal-primary)]"
              />
              <span className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                上記の取引内容およびクーリングオフに関する説明を理解し、売買に同意します。
              </span>
            </label>

            {/* 署名欄 */}
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">
                お客様署名（下の枠内に指またはペンで署名してください）
              </label>
              <SignaturePad onSignatureChange={setSignature} />
            </div>
          </div>
        </Card>

      </div>{/* /contractRef */}

      {/* ──── 操作ボタン（PDF範囲外）──── */}
      <div className="flex gap-3 justify-end pt-2">
        <Button
          variant="text"
          onClick={() => navigateWithPinCheck(`/store/schedule/${scheduleId}`)}
          disabled={submitting}
        >
          戻る
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!agreed || !signature || submitting}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              処理中...
            </span>
          ) : existingContract ? '再提出・再送信' : '同意して提出・送信'}
        </Button>
      </div>
    </div>
  )
}
