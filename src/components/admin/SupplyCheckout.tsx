'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'

type Props = {
  clientSecret: string
  customerSessionClientSecret?: string | null
  totalAmount: number
  orderNumber: string
  onSuccess: () => void
  onCancel: () => void
}

const stripePromise = getStripe()

export default function SupplyCheckout(props: Props) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        customerSessionClientSecret: props.customerSessionClientSecret ?? undefined,
        appearance: { theme: 'night', labels: 'floating' },
      }}
    >
      <CheckoutForm {...props} />
    </Elements>
  )
}

function CheckoutForm({ totalAmount, orderNumber, onSuccess, onCancel }: Props) {
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
    if (submitError) {
      setError(submitError.message ?? '入力内容を確認してください')
      setSubmitting(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message ?? '決済に失敗しました')
      setSubmitting(false)
      return
    }

    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onSuccess()
    } else {
      setError('決済が完了しませんでした。もう一度お試しください')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        発注番号 {orderNumber}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>
        お支払い金額：¥{totalAmount.toLocaleString()}
      </div>

      <PaymentElement />

      {error && (
        <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{ padding: '10px 16px', borderRadius: 8, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 14, cursor: 'pointer' }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? '処理中…' : `¥${totalAmount.toLocaleString()} を支払う`}
        </button>
      </div>
    </form>
  )
}
