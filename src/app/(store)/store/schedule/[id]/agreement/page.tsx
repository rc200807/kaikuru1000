'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

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
  user: { id: string; name: string; address: string; phone: string; email?: string }
  store: { id: string; name: string }
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
  const scheduleId = params.id as string

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [signature, setSignature] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [existingContract, setExistingContract] = useState<ExistingContract | null>(null)
  const contractRef = useRef<HTMLDivElement>(null)

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
        <Button variant="text" onClick={() => router.back()} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy年M月d日', { locale: ja })
  const coolingOffEnd = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy年M月d日（E）', { locale: ja })

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/store/schedule/${scheduleId}`)}
          className="text-[var(--portal-primary)] hover:underline text-sm"
        >
          ← 訪問詳細
        </button>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">売買契約書</h1>
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

      {/* ──── PDF出力対象エリア ──── */}
      <div ref={contractRef} className="space-y-5 bg-white p-1 rounded-xl">

        {/* ──── 取引内容 ──── */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">取引内容</h2>

          {/* 基本情報 */}
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1 mb-4 pb-4 border-b border-[var(--md-sys-color-outline-variant)]">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="font-medium">日付:</span> {today}</div>
              <div><span className="font-medium">訪問日:</span> {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}</div>
              <div><span className="font-medium">お客様:</span> {visit.user.name}</div>
              <div><span className="font-medium">住所:</span> {visit.user.address}</div>
              <div><span className="font-medium">電話:</span> {visit.user.phone}</div>
              <div><span className="font-medium">店舗:</span> {visit.store.name}</div>
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

        {/* ──── クーリングオフについて ──── */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">クーリングオフについて</h2>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-3 leading-relaxed">
            <p>
              特定商取引に関する法律に基づき、訪問購入（出張買取）においては、<strong className="text-[var(--md-sys-color-on-surface)]">契約書面を受領した日から8日間</strong>はクーリングオフ（契約の解除）が可能です。
            </p>
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-high)]">
              <p className="font-semibold text-[var(--md-sys-color-on-surface)] mb-1">クーリングオフの要点:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>契約書面を受領した日を含めて<strong>8日以内</strong>であれば、書面により契約の解除が可能です。</li>
                <li>クーリングオフ期間中は、売主（お客様）は<strong>物品の引渡しを拒むことができます。</strong></li>
                <li>クーリングオフをした場合、購入業者は受け取った物品を速やかに返還します。</li>
                <li>クーリングオフに伴う損害賠償や違約金の請求はありません。</li>
                <li>クーリングオフの通知は<strong>書面（はがき等）</strong>で行ってください。</li>
              </ul>
            </div>
            <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] bg-red-50 border border-red-300">
              <p className="font-semibold text-black mb-1">クーリングオフ期間:</p>
              <p className="text-black">
                本契約書面の受領日（{today}）から <strong>{coolingOffEnd}</strong> まで
              </p>
            </div>
            <p>
              クーリングオフに関するご不明な点は、最寄りの消費生活センター（局番なし<strong>188</strong>）にご相談ください。
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
          onClick={() => router.push(`/store/schedule/${scheduleId}`)}
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
