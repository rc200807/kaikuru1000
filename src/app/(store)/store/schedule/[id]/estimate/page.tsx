'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

/* ─── 型定義 ─── */
type PurchaseItem = { id: string; itemName?: string | null; category?: string | null; quantity: number; purchasePrice: number }
type WorkItem = { id: string; workName?: string | null; quantity: number; unitPrice: number }

type VisitDetail = {
  id: string
  visitDate: string
  user: { id: string; email?: string | null }
  store: { id: string; name: string; address?: string | null; phone?: string | null }
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
}

type ExistingEstimate = {
  id: string
  validUntil: string
  emailSentAt: string | null
  customerEmail: string | null
}

function defaultValidUntil(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

/* ─── メイン ─── */
export default function EstimatePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const scheduleId = params.id as string
  const staffName = searchParams.get('staff') || ((session?.user as any)?.name ?? '')

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [existing, setExisting] = useState<ExistingEstimate | null>(null)
  const [validUntil, setValidUntil] = useState(defaultValidUntil())
  const [emailInput, setEmailInput] = useState('')
  const estimateRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    const [visitRes, estRes] = await Promise.all([
      fetch(`/api/visit-schedules/${scheduleId}`),
      fetch(`/api/visit-schedules/${scheduleId}/estimate`),
    ])
    if (visitRes.ok) {
      const data = await visitRes.json()
      setVisit(data)
      setEmailInput((prev) => prev || data?.user?.email || '')
    }
    if (estRes.ok) {
      const est = await estRes.json()
      if (est) {
        setExisting(est)
        if (est.validUntil) setValidUntil(new Date(est.validUntil).toISOString().slice(0, 10))
        if (est.customerEmail) setEmailInput((prev) => prev || est.customerEmail)
      }
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => { if (session) fetchData() }, [session, fetchData])

  const fmtYen = (n: number) => `¥${n.toLocaleString()}`
  const purchaseTotal = visit?.purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0) ?? 0
  const workTotal = visit?.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0

  const handleSubmit = async () => {
    if (!visit) return
    const emailTrimmed = emailInput.trim()
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setMessage({ type: 'error', text: 'メールアドレスを正しく入力してください' })
      return
    }
    if (!validUntil) {
      setMessage({ type: 'error', text: '見積有効期限を入力してください' })
      return
    }
    setSubmitting(true)
    setMessage(null)

    try {
      let pdfBase64: string | null = null
      try {
        const { default: jsPDF } = await import('jspdf')
        const { default: html2canvas } = await import('html2canvas')
        if (estimateRef.current) {
          const canvas = await html2canvas(estimateRef.current, {
            scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          })
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          const pageWidth = pdf.internal.pageSize.getWidth()
          const pageHeight = pdf.internal.pageSize.getHeight()
          const imgWidth = pageWidth - 20
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
            if (remainingHeight > 0) { pdf.addPage(); yOffset = 10 }
          }
          pdfBase64 = pdf.output('datauristring').split(',')[1]
        }
      } catch (pdfErr) {
        console.error('PDF生成エラー:', pdfErr)
      }

      const res = await fetch(`/api/visit-schedules/${scheduleId}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil, staffName, pdfBase64, email: emailTrimmed }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '送信に失敗しました')
      }
      const result = await res.json()
      await fetchData()

      if (result.emailSent) {
        setMessage({ type: 'success', text: '見積書を保存し、メールで送信しました。' })
      } else {
        const reason = result.emailErrorReason === 'smtp-error' ? 'メール送信中にエラーが発生しました'
          : result.emailErrorReason === 'smtp-disabled' ? 'メール設定が未構成のため送信はスキップされました'
          : result.emailErrorReason === 'no-email' ? '送信先メールアドレスが指定されていません'
          : 'メール送信に失敗しました'
        setMessage({ type: 'error', text: `見積書は保存しましたが、${reason}。` })
      }

      if (pdfBase64) {
        const link = document.createElement('a')
        link.href = `data:application/pdf;base64,${pdfBase64}`
        link.download = `見積書_${format(new Date(), 'yyyyMMdd', { locale: ja })}.pdf`
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
        <Button variant="text" onClick={() => router.push(`/store/schedule/${scheduleId}`)} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy年M月d日', { locale: ja })
  const validUntilLabel = validUntil ? format(new Date(validUntil), 'yyyy年M月d日（E）', { locale: ja }) : '—'

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
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] flex-1">見積書</h1>
      </div>

      {existing && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 text-xs text-green-800 dark:text-green-200">
          <p className="font-semibold mb-0.5">見積書記録あり</p>
          {existing.emailSentAt
            ? <p>メール送信済: {format(new Date(existing.emailSentAt), 'yyyy年M月d日 HH:mm', { locale: ja })}</p>
            : <p>未送信</p>}
        </div>
      )}

      {message && <MessageBanner severity={message.type}>{message.text}</MessageBanner>}

      {/* 入力 */}
      <Card variant="elevated" padding="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">見積有効期限</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">見積書を送付するメールアドレス</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="example@example.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
            />
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">提出するとPDFをこのメールアドレス宛にお送りします。未登録の場合は顧客情報に登録されます。</p>
          </div>
        </div>
      </Card>

      {/* ──── PDF出力対象エリア（お見積書） ──── */}
      <div ref={estimateRef} className="bg-white p-1 rounded-xl">
        <Card variant="elevated" padding="md">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-[var(--portal-primary)]">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">お見積書</h2>
            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">発行日: {today}</span>
          </div>

          {/* 店舗・担当者情報 */}
          <div className="space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)] text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">見積発行店舗</div>
            <div><span className="font-medium">店舗名:</span> {visit.store.name}</div>
            {visit.store.address && <div><span className="font-medium">住所:</span> {visit.store.address}</div>}
            {visit.store.phone && <div><span className="font-medium">電話:</span> {visit.store.phone}</div>}
            {staffName && <div><span className="font-medium">担当者:</span> {staffName}</div>}
          </div>

          {/* 有効期限 */}
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            <span className="font-medium">見積有効期限:</span> {validUntilLabel}
          </div>

          {/* 買取品目の明細 */}
          {visit.purchaseItems.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">買取品目</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="py-1.5 text-left font-medium">品名</th>
                    <th className="py-1.5 text-right font-medium w-12">数量</th>
                    <th className="py-1.5 text-right font-medium w-20">単価</th>
                    <th className="py-1.5 text-right font-medium w-24">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.purchaseItems.map(i => (
                    <tr key={i.id} className="border-b border-[var(--md-sys-color-outline-variant)]/60">
                      <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">
                        {i.itemName || '（品名未設定）'}
                        {i.category && <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] ml-1">/ {i.category}</span>}
                      </td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{i.quantity}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{fmtYen(i.purchasePrice)}</td>
                      <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(i.purchasePrice * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 請求項目（作業・サービス）の明細 */}
          {visit.workItems.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">請求項目（作業・サービス）</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="py-1.5 text-left font-medium">項目</th>
                    <th className="py-1.5 text-right font-medium w-12">数量</th>
                    <th className="py-1.5 text-right font-medium w-20">単価</th>
                    <th className="py-1.5 text-right font-medium w-24">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.workItems.map(i => (
                    <tr key={i.id} className="border-b border-[var(--md-sys-color-outline-variant)]/60">
                      <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{i.workName || '（項目未設定）'}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{i.quantity}</td>
                      <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{fmtYen(i.unitPrice)}</td>
                      <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(i.unitPrice * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 金額 */}
          <table className="w-full text-sm border-t-2 border-[var(--md-sys-color-outline-variant)]">
            <tbody>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)]">買取金額 合計</td>
                <td className="py-3 text-right font-bold text-lg text-[var(--portal-primary)]">{fmtYen(purchaseTotal)}</td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--md-sys-color-on-surface-variant)]">請求金額 合計</td>
                <td className="py-3 text-right font-bold text-lg text-[var(--md-sys-color-on-surface)]">{fmtYen(workTotal)}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-4">
            ※ 本見積書は概算であり、現品確認後に金額が変動する場合がございます。
          </p>
        </Card>
      </div>

      {/* 操作ボタン */}
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="text" onClick={() => router.push(`/store/schedule/${scheduleId}`)} disabled={submitting}>
          戻る
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || !emailInput.trim() || !validUntil}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              処理中...
            </span>
          ) : existing ? '見積書を再送信' : '見積書を出力・送信'}
        </Button>
      </div>
    </div>
  )
}
