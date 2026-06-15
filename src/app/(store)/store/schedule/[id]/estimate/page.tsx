'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import { QRCodeSVG } from 'qrcode.react'
import { formalName } from '@/lib/operator-utils'

/* ─── 型定義 ─── */
type PurchaseItem = { id: string; itemName?: string | null; category?: string | null; quantity: number; purchasePrice: number }
type WorkItem = { id: string; workName?: string | null; quantity: number; unitPrice: number }

type VisitDetail = {
  id: string
  visitDate: string
  user: { id: string; email?: string | null }
  store: {
    id: string; name: string; address?: string | null; phone?: string | null
    operator?: { entityType: string | null; corporatePrefix: string | null; prefixPosition: string | null; name: string; address?: string | null; representativeName?: string | null } | null
  }
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
  const saleEstimateRef = useRef<HTMLDivElement>(null)
  const invoiceEstimateRef = useRef<HTMLDivElement>(null)
  const [magicUrl, setMagicUrl] = useState<string | null>(null)
  const [magicLoading, setMagicLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generateEstimateLink() {
    if (!visit) return
    setMagicLoading(true)
    try {
      const res = await fetch('/api/magic-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: visit.user.id, contractId: scheduleId }),
      })
      if (res.ok) {
        const data = await res.json()
        // 見積閲覧として開くよう doc=estimate を付与
        setMagicUrl(`${data.url}${data.url.includes('?') ? '&' : '?'}doc=estimate`)
      } else {
        setMessage({ type: 'error', text: 'お客様用リンクの発行に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: 'お客様用リンクの発行に失敗しました' })
    } finally {
      setMagicLoading(false)
    }
  }

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
      let invoicePdfBase64: string | null = null
      try {
        const { default: jsPDF } = await import('jspdf')
        const { default: html2canvas } = await import('html2canvas')
        const genPdf = async (el: HTMLElement): Promise<string | null> => {
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
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
            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 10, yOffset, imgWidth, printHeight)
            remainingHeight -= printHeight
            sourceY += sourceHeight
            if (remainingHeight > 0) { pdf.addPage(); yOffset = 10 }
          }
          return pdf.output('datauristring').split(',')[1]
        }
        if (saleEstimateRef.current) pdfBase64 = await genPdf(saleEstimateRef.current)
        if (invoiceEstimateRef.current) invoicePdfBase64 = await genPdf(invoiceEstimateRef.current)
      } catch (pdfErr) {
        console.error('PDF生成エラー:', pdfErr)
      }

      const res = await fetch(`/api/visit-schedules/${scheduleId}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil, staffName, pdfBase64, invoicePdfBase64, email: emailTrimmed }),
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

      const ymd = format(new Date(), 'yyyyMMdd', { locale: ja })
      const dl = (b64: string, name: string) => {
        const link = document.createElement('a')
        link.href = `data:application/pdf;base64,${b64}`
        link.download = name
        link.click()
      }
      if (pdfBase64) dl(pdfBase64, `買取見積書_${ymd}.pdf`)
      if (invoicePdfBase64) dl(invoicePdfBase64, `請求見積書_${ymd}.pdf`)
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

      {/* ──── PDF出力対象①：買取見積（店舗情報） ──── */}
      <div ref={saleEstimateRef} className="bg-white p-1 rounded-xl">
        <Card variant="elevated" padding="md">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-[var(--portal-primary)]">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">お見積書（買取）</h2>
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
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            <span className="font-medium">見積有効期限:</span> {validUntilLabel}
          </div>
          <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">買取品目</div>
          {visit.purchaseItems.length > 0 ? (
            <table className="w-full text-xs mb-2">
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
                    <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{i.itemName || '（品名未設定）'}{i.category && <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] ml-1">/ {i.category}</span>}</td>
                    <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{i.quantity}</td>
                    <td className="py-1.5 text-right text-[var(--md-sys-color-on-surface-variant)]">{fmtYen(i.purchasePrice)}</td>
                    <td className="py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(i.purchasePrice * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">買取品目は登録されていません</p>}
          <table className="w-full text-sm border-t-2 border-[var(--md-sys-color-outline-variant)]">
            <tbody><tr><td className="py-3 text-[var(--md-sys-color-on-surface-variant)]">買取金額 合計</td><td className="py-3 text-right font-bold text-lg text-[var(--portal-primary)]">{fmtYen(purchaseTotal)}</td></tr></tbody>
          </table>
          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-4">※ 本見積書は概算であり、現品確認後に金額が変動する場合がございます。</p>
        </Card>
      </div>

      {/* ──── PDF出力対象②：請求見積（運営会社情報） ──── */}
      <div ref={invoiceEstimateRef} className="bg-white p-1 rounded-xl">
        <Card variant="elevated" padding="md">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-[var(--md-sys-color-on-surface)]">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">お見積書（請求）</h2>
            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">発行日: {today}</span>
          </div>
          {/* 運営会社情報 */}
          <div className="space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)] text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">請求元</div>
            <div><span className="font-medium">名称:</span> {visit.store.operator ? formalName(visit.store.operator) : visit.store.name}</div>
            {(visit.store.operator?.address || visit.store.address) && <div><span className="font-medium">所在地:</span> {visit.store.operator?.address || visit.store.address}</div>}
            {staffName && <div><span className="font-medium">担当者:</span> {staffName}</div>}
          </div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            <span className="font-medium">見積有効期限:</span> {validUntilLabel}
          </div>
          <div className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">請求項目（作業・サービス）</div>
          {visit.workItems.length > 0 ? (
            <table className="w-full text-xs mb-2">
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
          ) : <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">請求項目は登録されていません</p>}
          <table className="w-full text-sm border-t-2 border-[var(--md-sys-color-outline-variant)]">
            <tbody><tr><td className="py-3 text-[var(--md-sys-color-on-surface-variant)]">請求金額 合計</td><td className="py-3 text-right font-bold text-lg text-[var(--md-sys-color-on-surface)]">{fmtYen(workTotal)}</td></tr></tbody>
          </table>
          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-4">※ 本見積書は概算であり、現品確認後に金額が変動する場合がございます。</p>
        </Card>
      </div>

      {/* お客様用 閲覧リンク / QRコード */}
      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-1">お客様用 見積書リンク（QRコード）</h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
          {existing ? 'QRコードを発行すると、お客様がスマホで見積書を閲覧・PDFダウンロードできます。' : '※ 先に見積書を保存・送信するとPDFダウンロードも可能になります。'}
        </p>
        {!magicUrl ? (
          <Button variant="tonal" onClick={generateEstimateLink} loading={magicLoading} disabled={magicLoading}>
            {magicLoading ? '発行中...' : 'QRコード・リンクを発行'}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)]">
              <QRCodeSVG value={magicUrl} size={180} />
            </div>
            <div className="w-full flex items-center gap-2">
              <input readOnly value={magicUrl} className="flex-1 px-2 py-1.5 text-xs rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]" />
              <Button size="sm" variant="tonal" onClick={() => { navigator.clipboard?.writeText(magicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                {copied ? 'コピー済' : 'コピー'}
              </Button>
            </div>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">このリンクは72時間有効です。</p>
          </div>
        )}
      </Card>

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
