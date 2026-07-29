'use client'

import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

const stripePromise = getStripe()

export type StoreCardInfo = {
  id: string
  brand: string
  last4: string
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}

export const CARD_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', jcb: 'JCB', discover: 'Discover', diners: 'Diners Club', unionpay: 'UnionPay',
}

/**
 * 店舗の支払い用クレジットカード管理（登録・削除・デフォルト設定）。
 * AdminCardManager と同フローだが、店舗ポータルはライトテーマ固定のため appearance は 'stripe'。
 */
export default function StoreCardManager({ onCardsChanged }: { onCardsChanged?: (count: number) => void }) {
  const [cards, setCards] = useState<StoreCardInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function load() {
    return fetch('/api/store/billing/payment-methods')
      .then(r => (r.ok ? r.json() : { cards: [] }))
      .then(d => {
        setCards(d.cards ?? [])
        onCardsChanged?.((d.cards ?? []).length)
      })
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(type: 'success' | 'error', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function startAdd() {
    setMsg(null)
    setPreparing(true)
    try {
      const res = await fetch('/api/store/billing/setup-intent', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? 'カード登録の準備に失敗しました'); return }
      setClientSecret(j.clientSecret)
    } finally {
      setPreparing(false)
    }
  }

  async function handleDelete(c: StoreCardInfo) {
    if (!confirm(`${CARD_BRAND_LABEL[c.brand] ?? c.brand} •••• ${c.last4} を削除しますか？`)) return
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/store/billing/payment-methods/${c.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); flash('error', j.error ?? '削除に失敗しました'); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetDefault(c: StoreCardInfo) {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/store/billing/payment-methods/${c.id}`, { method: 'PATCH' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); flash('error', j.error ?? '設定に失敗しました'); return }
      await load()
      flash('success', 'デフォルトカードを変更しました')
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
    <Card variant="elevated" padding="lg">
      <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">支払い用クレジットカード</h2>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">
        システム利用料などのお支払いに使用するカードです。複数登録した場合、「デフォルト」のカードへ請求されます。
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
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="text-sm text-[var(--md-sys-color-on-surface)]">
                    <span className="font-semibold">{CARD_BRAND_LABEL[c.brand] ?? c.brand}</span>
                    <span className="mx-2 font-mono">•••• {c.last4}</span>
                    {c.expMonth && c.expYear && (
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">
                        有効期限 {String(c.expMonth).padStart(2, '0')}/{c.expYear}
                      </span>
                    )}
                    {c.isDefault && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary,#fff)] font-medium align-middle">デフォルト</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {!c.isDefault && (
                      <button
                        onClick={() => handleSetDefault(c)}
                        disabled={busyId === c.id}
                        className="text-sm text-[var(--portal-primary)] hover:underline disabled:opacity-50"
                      >
                        デフォルトにする
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={busyId === c.id}
                      className="text-sm text-[var(--md-sys-color-error)] hover:underline disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', labels: 'floating' } }}>
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
