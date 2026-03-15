'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    licenseKey: '',
    name: '',
    furigana: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    passwordConfirm: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.passwordConfirm) {
      setError('パスワードが一致しません')
      return
    }

    if (formData.password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }

    setLoading(true)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        furigana: formData.furigana,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        password: formData.password,
        licenseKey: formData.licenseKey,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '登録に失敗しました')
      return
    }

    setStep(3)
  }

  // Step 3: Registration complete
  if (step === 3) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-surface,#FFFBFE)] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Card variant="elevated" padding="lg">
            <div className="w-16 h-16 bg-[var(--status-completed-bg,#DCFCE7)] rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[var(--status-completed-text,#16A34A)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--md-sys-color-on-surface)] mb-3">
              登録完了
            </h2>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-7 leading-relaxed">
              会員登録が完了しました。<br />
              担当店舗が決まり次第、ご連絡いたします。
            </p>
            <Button
              onClick={() => router.push('/login')}
              fullWidth
              size="lg"
            >
              ログインする
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  const steps = [
    { num: 1, label: 'ライセンス確認' },
    { num: 2, label: '基本情報' },
  ]

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface,#FFFBFE)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
            新規会員登録
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8 gap-4">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm
                    transition-colors duration-200
                    ${step >= s.num
                      ? 'bg-[var(--portal-primary,#B91C1C)] text-[var(--portal-on-primary,#fff)]'
                      : 'bg-[var(--md-sys-color-surface-container-high,#E6E0E9)] text-[var(--md-sys-color-on-surface-variant)]'
                    }
                  `}
                >
                  {step > s.num ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s.num
                  )}
                </div>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1.5">
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`
                    w-16 h-0.5 mx-3 -mt-5 transition-colors duration-200
                    ${step > s.num
                      ? 'bg-[var(--portal-primary,#B91C1C)]'
                      : 'bg-[var(--md-sys-color-outline-variant,#CAC4D0)]'
                    }
                  `}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form card */}
        <Card variant="elevated" padding="lg">
          {error && (
            <div className="mb-6">
              <MessageBanner severity="error">{error}</MessageBanner>
            </div>
          )}

          {/* Step 1: License key */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                  ライセンスキーの確認
                </h3>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  担当者からお渡しされたライセンスキーを入力してください。
                </p>
              </div>

              <TextField
                label="ライセンスキー"
                value={formData.licenseKey}
                onChange={(val) => { setFormData({ ...formData, licenseKey: val }); setError('') }}
                required
                placeholder="KK-2024-XXXX-0000"
              />

              <Button
                onClick={() => {
                  if (!formData.licenseKey.trim()) {
                    setError('ライセンスキーを入力してください')
                    return
                  }
                  setStep(2)
                }}
                fullWidth
                size="lg"
              >
                次へ
              </Button>
            </div>
          )}

          {/* Step 2: Personal info */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
                基本情報の入力
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  label="氏名"
                  value={formData.name}
                  onChange={(val) => { setFormData({ ...formData, name: val }); setError('') }}
                  required
                  placeholder="山田 太郎"
                />
                <TextField
                  label="ふりがな"
                  value={formData.furigana}
                  onChange={(val) => { setFormData({ ...formData, furigana: val }); setError('') }}
                  required
                  placeholder="やまだ たろう"
                />
              </div>

              <TextField
                label="メールアドレス"
                type="email"
                value={formData.email}
                onChange={(val) => { setFormData({ ...formData, email: val }); setError('') }}
                required
                placeholder="example@email.com"
              />

              <TextField
                label="電話番号"
                type="tel"
                value={formData.phone}
                onChange={(val) => { setFormData({ ...formData, phone: val }); setError('') }}
                required
                placeholder="090-0000-0000"
              />

              <TextField
                label="訪問先住所"
                value={formData.address}
                onChange={(val) => { setFormData({ ...formData, address: val }); setError('') }}
                required
                placeholder="東京都渋谷区..."
              />

              <TextField
                label="パスワード"
                type="password"
                value={formData.password}
                onChange={(val) => { setFormData({ ...formData, password: val }); setError('') }}
                required
                placeholder="8文字以上"
              />

              <TextField
                label="パスワード（確認）"
                type="password"
                value={formData.passwordConfirm}
                onChange={(val) => { setFormData({ ...formData, passwordConfirm: val }); setError('') }}
                required
                placeholder="パスワードを再入力"
              />

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outlined"
                  onClick={() => setStep(1)}
                  fullWidth
                  size="lg"
                >
                  戻る
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  loading={loading}
                  fullWidth
                  size="lg"
                >
                  {loading ? '登録中...' : '登録する'}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Login link */}
        <p className="text-center mt-5 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          すでにアカウントをお持ちの方は{' '}
          <Link
            href="/login"
            className="text-[var(--portal-primary,#B91C1C)] font-medium hover:underline"
          >
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
