'use client'

// お支払い情報: 支払い用カードの登録・管理と支払い履歴（領収書発行・再決済）
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import StoreCardManager from '@/components/store/StoreCardManager'
import ReceiptPrintable, { type ReceiptData } from '@/components/store/ReceiptPrintable'
import { formatYen } from '@/lib/currency'
import { formatJstDate } from '@/lib/datetime'

const stripePromise = getStripe()

type Payment = {
  id: string
  kind: string
  billingMonth: string | null
  description: string
  amount: number
  status: string
  failureMessage: string | null
  paidAt: string | null
  receiptNumber: string | null
  receiptName: string | null
  receiptIssuedAt: string | null
  createdAt: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: '支払い済み', className: 'bg-green-100 text-green-800' },
  pending: { label: '処理中', className: 'bg-blue-100 text-blue-800' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-700' },
  no_card: { label: 'カード未登録', className: 'bg-amber-100 text-amber-800' },
}

export default function StoreBillingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sessionUser = session?.user as any

  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loadingList, setLoadingList] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 領収書
  const [receiptTarget, setReceiptTarget] = useState<Payment | null>(null)
  const [receiptName, setReceiptName] = useState('')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // 再決済
  const [retryTarget, setRetryTarget] = useState<Payment | null>(null)
  const [retrySecrets, setRetrySecrets] = useState<{ clientSecret: string; customerSessionClientSecret: string } | null>(null)
  const [retryPreparing, setRetryPreparing] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
    if (status === 'authenticated' && sessionUser?.role !== 'store') router.push('/')
  }, [status, sessionUser, router])

  const loadPayments = useCallback(async (p: number) => {
    setLoadingList(true)
    try {
      const res = await fetch(`/api/store/billing/payments?page=${p}`)
      if (res.ok) {
        const d = await res.json()
        setPayments(d.payments)
        setTotal(d.total)
        setPageSize(d.pageSize)
        setPage(d.page)
      }
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated' && sessionUser?.role === 'store') loadPayments(1)
  }, [status, sessionUser?.role, loadPayments])

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // ─── 領収書 ───
  function openReceipt(p: Payment) {
    setReceiptTarget(p)
    setReceiptName(p.receiptName || sessionUser?.name || '')
    setReceiptData(null)
  }

  async function issueReceipt() {
    if (!receiptTarget) return
    setIssuing(true)
    try {
      const res = await fetch(`/api/store/billing/payments/${receiptTarget.id}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptName }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '領収書の発行に失敗しました'); return }
      setReceiptData({
        receiptNumber: j.receiptNumber,
        receiptName: j.receiptName,
        amount: j.amount,
        description: j.description,
        paidAt: j.paidAt,
        issuedAt: j.receiptIssuedAt,
      })
      loadPayments(page)
    } finally {
      setIssuing(false)
    }
  }

  async function downloadReceiptPdf() {
    if (!printRef.current || !receiptData) return
    setDownloading(true)
    try {
      const { elementToPdf } = await import('@/lib/pdf-export')
      await elementToPdf(printRef.current, { mode: 'save', filename: `領収書_${receiptData.receiptNumber}.pdf` })
    } catch {
      flash('error', 'PDFの生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  // ─── 再決済 ───
  async function startRetry(p: Payment) {
    setRetryTarget(p)
    setRetrySecrets(null)
    setRetryPreparing(true)
    try {
      const res = await fetch(`/api/store/billing/payments/${p.id}/retry`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '再決済の準備に失敗しました'); setRetryTarget(null); return }
      if (j.alreadyPaid) {
        flash('success', 'この支払いはすでに完了しています')
        setRetryTarget(null)
        loadPayments(page)
        return
      }
      setRetrySecrets(j)
    } finally {
      setRetryPreparing(false)
    }
  }

  async function onRetryDone() {
    if (retryTarget) {
      await fetch(`/api/store/billing/payments/${retryTarget.id}/sync`, { method: 'POST' }).catch(() => {})
    }
    setRetryTarget(null)
    setRetrySecrets(null)
    flash('success', 'お支払いが完了しました')
    loadPayments(page)
  }

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <AppBar title="お支払い情報" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {message && <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)} className="mb-6">{message.text}</MessageBanner>}

        <div className="space-y-6">
          {/* カード管理 */}
          <StoreCardManager />

          {/* 支払い履歴 */}
          <Card variant="elevated" padding="lg">
            <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">支払い履歴</h2>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">
              支払い済みの項目は領収書（PDF）を発行できます。宛名は発行時に変更できます。
            </p>

            {loadingList ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
            ) : payments.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">支払い履歴はまだありません。</p>
            ) : (
              <>
                <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                  {payments.map(p => {
                    const badge = STATUS_BADGE[p.status] ?? { label: p.status, className: 'bg-gray-100 text-gray-700' }
                    return (
                      <li key={p.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{p.description}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
                            </div>
                            <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                              {formatJstDate(p.paidAt ?? p.createdAt)}
                              {p.receiptNumber && <span className="ml-2">領収書 {p.receiptNumber} 発行済み</span>}
                            </div>
                            {(p.status === 'failed' || p.status === 'no_card') && p.failureMessage && (
                              <div className="text-xs text-[var(--md-sys-color-error)] mt-1">{p.failureMessage}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{formatYen(p.amount)}</span>
                            {p.status === 'paid' && (
                              <Button variant="outlined" size="sm" onClick={() => openReceipt(p)}>領収書</Button>
                            )}
                            {(p.status === 'failed') && (
                              <Button variant="filled" size="sm" onClick={() => startRetry(p)} loading={retryPreparing && retryTarget?.id === p.id}>再決済</Button>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                    <Button variant="text" size="sm" disabled={page <= 1} onClick={() => loadPayments(page - 1)}>前へ</Button>
                    <span className="text-[var(--md-sys-color-on-surface-variant)] tabular-nums">{page} / {totalPages}</span>
                    <Button variant="text" size="sm" disabled={page >= totalPages} onClick={() => loadPayments(page + 1)}>次へ</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {/* 領収書モーダル */}
      <Modal
        open={!!receiptTarget}
        onClose={() => { if (!issuing && !downloading) { setReceiptTarget(null); setReceiptData(null) } }}
        title="領収書の発行"
        size="md"
      >
        {receiptTarget && (
          <div className="space-y-4">
            <div className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {receiptTarget.description} ／ {formatYen(receiptTarget.amount)}
            </div>
            {!receiptData ? (
              <>
                <TextField
                  label="宛名"
                  value={receiptName}
                  onChange={setReceiptName}
                  placeholder="例: 株式会社◯◯"
                />
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  宛名は後から変更して再発行できます（領収書番号は変わりません）。
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="text" onClick={() => setReceiptTarget(null)} disabled={issuing}>キャンセル</Button>
                  <Button variant="filled" onClick={issueReceipt} loading={issuing} disabled={!receiptName.trim() || issuing}>発行する</Button>
                </div>
              </>
            ) : (
              <>
                <MessageBanner severity="success">領収書 {receiptData.receiptNumber} を発行しました</MessageBanner>
                <div className="flex justify-end gap-2">
                  <Button variant="text" onClick={() => { setReceiptTarget(null); setReceiptData(null) }} disabled={downloading}>閉じる</Button>
                  <Button variant="filled" onClick={downloadReceiptPdf} loading={downloading}>PDFをダウンロード</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 再決済モーダル */}
      <Modal
        open={!!retryTarget && !!retrySecrets}
        onClose={() => { setRetryTarget(null); setRetrySecrets(null) }}
        title="お支払い"
        size="md"
      >
        {retryTarget && retrySecrets && (
          <div className="space-y-4">
            <div className="text-sm text-[var(--md-sys-color-on-surface)]">
              {retryTarget.description} ／ <span className="font-bold">{formatYen(retryTarget.amount)}</span>
            </div>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: retrySecrets.clientSecret,
                customerSessionClientSecret: retrySecrets.customerSessionClientSecret,
                appearance: { theme: 'stripe', labels: 'floating' },
              }}
            >
              <RetryPaymentForm onDone={onRetryDone} onCancel={() => { setRetryTarget(null); setRetrySecrets(null) }} />
            </Elements>
          </div>
        )}
      </Modal>

      {/* 領収書のPDF化用オフスクリーンDOM */}
      {receiptData && (
        <div style={{ position: 'fixed', left: -10000, top: 0 }} aria-hidden="true">
          <div ref={printRef}>
            <ReceiptPrintable data={receiptData} />
          </div>
        </div>
      )}
    </>
  )
}

function RetryPaymentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError('')

    const { error: submitError } = await elements.submit()
    if (submitError) { setError(submitError.message ?? '入力内容を確認してください'); setSubmitting(false); return }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })
    if (confirmError) { setError(confirmError.message ?? '決済に失敗しました'); setSubmitting(false); return }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onDone()
    } else {
      setError('決済が完了しませんでした。もう一度お試しください')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ wallets: { applePay: 'never', googlePay: 'never' } }} />
      {error && <p className="text-sm text-[var(--md-sys-color-error)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="text" onClick={onCancel} disabled={submitting}>キャンセル</Button>
        <Button type="submit" variant="filled" loading={submitting} disabled={!stripe || submitting}>支払う</Button>
      </div>
    </form>
  )
}
