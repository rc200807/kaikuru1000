'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { loadStripe, Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import LoadingSpinner from '@/components/LoadingSpinner'

type PaymentMethod = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  created: number
}

type ListResponse = {
  stripeConfigured: boolean
  paymentMethods: PaymentMethod[]
  defaultPaymentMethodId: string | null
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  jcb: 'JCB',
  discover: 'Discover',
  diners: 'Diners Club',
  unionpay: 'UnionPay',
}

export default function StorePaymentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sessionUser = session?.user as any
  const isSubAccount = !!sessionUser?.isSubAccount

  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [setupClientSecret, setSetupClientSecret] = useState('')
  const [stripePromise, setStripePromise] = useState<Promise<StripeJs | null> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  function load() {
    fetch('/api/store/payment/payment-methods')
      .then(r => r.json())
      .then((d: ListResponse) => {
        setData(d)
        if (!d.stripeConfigured) {
          setError('Stripeが未設定です。管理者にお問い合わせください。')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status === 'authenticated' && !isSubAccount) load()
  }, [status, isSubAccount])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function startAdd() {
    setError('')
    setShowAddForm(true)
    const res = await fetch('/api/store/payment/setup-intent', { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error ?? 'カード登録の準備に失敗しました')
      setShowAddForm(false)
      return
    }
    if (!j.publishableKey) {
      setError('STRIPE 公開キーが未設定です')
      setShowAddForm(false)
      return
    }
    setStripePromise(loadStripe(j.publishableKey))
    setSetupClientSecret(j.clientSecret)
  }

  async function handleDelete(pmId: string) {
    if (!confirm('このカードを削除しますか？')) return
    setBusyId(pmId)
    const res = await fetch(`/api/store/payment/payment-methods/${pmId}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash('error', j.error ?? '削除に失敗しました')
      return
    }
    flash('success', 'カードを削除しました')
    load()
  }

  async function handleSetDefault(pmId: string) {
    setBusyId(pmId)
    const res = await fetch(`/api/store/payment/payment-methods/${pmId}/default`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash('error', j.error ?? '設定に失敗しました')
      return
    }
    flash('success', 'デフォルトカードを変更しました')
    load()
  }

  if (status !== 'authenticated') return null
  if (isSubAccount) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          決済情報の管理は店舗オーナーのみご利用いただけます。サブアカウントでは表示できません。
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mb-1">決済情報</h1>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6">
        システム利用料・備品購入などに使用するクレジットカードを登録します。カード情報は Stripe で安全に保管されます。
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 rounded text-xs bg-rose-500/10 text-rose-500 border border-rose-500/30">{error}</div>
      )}
      {msg && (
        <div className={`mb-4 px-3 py-2 rounded text-xs ${
          msg.kind === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
        }`}>{msg.text}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner /></div>
      ) : (
        <>
          {/* カード一覧 */}
          <div className="space-y-2 mb-4">
            {data && data.paymentMethods.length === 0 ? (
              <div className="text-sm text-[var(--md-sys-color-on-surface-variant)] px-4 py-6 rounded-xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center">
                まだカードが登録されていません
              </div>
            ) : (
              data?.paymentMethods.map(pm => {
                const isDefault = pm.id === data.defaultPaymentMethodId
                return (
                  <div
                    key={pm.id}
                    className={`flex items-center gap-3 p-4 rounded-2xl border ${
                      isDefault
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-md bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center text-xs font-bold">
                      {pm.brand?.slice(0, 2).toUpperCase() ?? '——'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {pm.brand ? (BRAND_LABEL[pm.brand] ?? pm.brand) : 'カード'} ····{pm.last4 ?? '????'}
                        {isDefault && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">デフォルト</span>}
                      </p>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        有効期限 {pm.expMonth?.toString().padStart(2, '0')}/{pm.expYear}
                      </p>
                    </div>
                    {!isDefault && (
                      <button
                        onClick={() => handleSetDefault(pm.id)}
                        disabled={busyId === pm.id}
                        className="text-xs px-2 py-1 rounded text-[var(--md-sys-color-primary)] hover:underline disabled:opacity-50"
                      >
                        デフォルトに
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(pm.id)}
                      disabled={busyId === pm.id}
                      className="text-xs px-2 py-1 rounded text-rose-500 hover:underline disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* 追加ボタン */}
          {data?.stripeConfigured && !showAddForm && (
            <button
              onClick={startAdd}
              className="w-full py-3 rounded-xl bg-[var(--store-primary)] text-[var(--store-on-primary)] text-sm font-semibold hover:opacity-90"
            >
              + 新しいカードを登録
            </button>
          )}

          {/* 追加フォーム（Stripe Elements） */}
          {showAddForm && setupClientSecret && stripePromise && (
            <div className="mt-4 p-5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
              <h2 className="text-base font-bold mb-3">カードを登録</h2>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: setupClientSecret,
                  appearance: { theme: 'stripe' },
                  locale: 'ja',
                }}
              >
                <AddCardForm
                  onSuccess={() => {
                    setShowAddForm(false)
                    setSetupClientSecret('')
                    flash('success', 'カードを登録しました')
                    load()
                  }}
                  onCancel={() => { setShowAddForm(false); setSetupClientSecret('') }}
                />
              </Elements>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setErr('')
    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: typeof window !== 'undefined' ? `${window.location.origin}/store/payment` : '',
      },
      redirect: 'if_required',
    })
    setSubmitting(false)
    if (error) {
      setErr(error.message ?? 'カード登録に失敗しました')
      return
    }
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {err && <p className="text-xs text-rose-500">{err}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-md border border-[var(--md-sys-color-outline)] text-sm"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={submitting || !stripe}
          className="px-4 py-2 rounded-md bg-[var(--store-primary)] text-[var(--store-on-primary)] text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? '登録中…' : 'カードを登録'}
        </button>
      </div>
    </form>
  )
}
