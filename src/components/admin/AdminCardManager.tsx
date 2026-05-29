'use client'

import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

const stripePromise = getStripe()

type CardInfo = {
  id: string
  brand: string
  last4: string
  expMonth: number | null
  expYear: number | null
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', jcb: 'JCB', discover: 'Discover', diners: 'Diners Club', unionpay: 'UnionPay',
}

export default function AdminCardManager() {
  const [cards, setCards] = useState<CardInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function load() {
    return fetch('/api/admin/payment/payment-methods')
      .then(r => (r.ok ? r.json() : []))
      .then(setCards)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  function flash(type: 'success' | 'error', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function startAdd() {
    setMsg(null)
    setPreparing(true)
    try {
      const res = await fetch('/api/admin/payment/setup-intent', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? 'カード登録の準備に失敗しました'); return }
      setClientSecret(j.clientSecret)
    } finally {
      setPreparing(false)
    }
  }

  async function handleDelete(c: CardInfo) {
    if (!confirm(`${BRAND_LABEL[c.brand] ?? c.brand} •••• ${c.last4} を削除しますか？`)) return
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/admin/payment/payment-methods/${c.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); flash('error', j.error ?? '削除に失敗しました'); return }
      load()
    } finally {
      setBusyId(null)
    }
  }

  function onAdded() {
    setClientSecret(null)
    load()
    flash('success', 'クレジットカードを登録しました')
  }

  return (
    <Card variant="outlined" padding="lg">
      <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">クレジットカード（備品発注の決済）</h2>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">
        ここで登録したカードは、備品発注の決済時に選択して利用できます（本部共通）。
      </p>

      {msg && <MessageBanner severity={msg.type} className="mb-4">{msg.text}</MessageBanner>}

      {loading ? (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
      ) : (
        <>
          {cards.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">登録済みのカードはありません。</p>
          ) : (
            <ul className="mb-4 divide-y divide-[var(--md-sys-color-outline-variant)] rounded-lg border border-[var(--md-sys-color-outline-variant)]">
              {cards.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="text-sm text-[var(--md-sys-color-on-surface)]">
                    <span className="font-semibold">{BRAND_LABEL[c.brand] ?? c.brand}</span>
                    <span className="mx-2 font-mono">•••• {c.last4}</span>
                    {c.expMonth && c.expYear && (
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        有効期限 {String(c.expMonth).padStart(2, '0')}/{c.expYear}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={busyId === c.id}
                    className="text-sm text-[var(--md-sys-color-error)] hover:underline disabled:opacity-50"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}

          {clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', labels: 'floating' } }}>
              <AddCardForm onAdded={onAdded} onCancel={() => setClientSecret(null)} />
            </Elements>
          ) : (
            <Button variant="outlined" size="md" onClick={startAdd} loading={preparing} disabled={preparing}>
              ＋ カードを追加
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

function AddCardForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
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

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })
    if (confirmError) { setError(confirmError.message ?? 'カードの登録に失敗しました'); setSubmitting(false); return }

    if (setupIntent && setupIntent.status === 'succeeded') {
      onAdded()
    } else {
      setError('登録が完了しませんでした。もう一度お試しください')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-4">
      <PaymentElement options={{ wallets: { applePay: 'never', googlePay: 'never' } }} />
      {error && <p className="text-sm text-[var(--md-sys-color-error)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="text" onClick={onCancel} disabled={submitting}>キャンセル</Button>
        <Button type="submit" variant="filled" loading={submitting} disabled={!stripe || submitting}>カードを登録</Button>
      </div>
    </form>
  )
}
