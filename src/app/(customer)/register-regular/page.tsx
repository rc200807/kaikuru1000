'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'

export default function RegisterRegularPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    furigana: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    passwordConfirm: '',
  })

  function handleChange(field: string, val: string) {
    setFormData({ ...formData, [field]: val })
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
        customerType: 'regular',
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '登録に失敗しました')
      return
    }

    setDone(true)
  }

  // 登録完了画面
  if (done) {
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

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface,#FFFBFE)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-3xl font-bold text-[var(--portal-primary,#B91C1C)] tracking-tight"
          >
            買いクル
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
            通常会員 新規登録
          </p>
        </div>

        {/* Form card */}
        <Card variant="elevated" padding="lg">
          {error && (
            <div className="mb-6">
              <MessageBanner severity="error">{error}</MessageBanner>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                基本情報の入力
              </h3>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                ライセンスキーは不要です。以下の情報を入力してください。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="氏名"
                value={formData.name}
                onChange={(val) => handleChange('name', val)}
                required
                placeholder="山田 太郎"
              />
              <TextField
                label="ふりがな"
                value={formData.furigana}
                onChange={(val) => handleChange('furigana', val)}
                required
                placeholder="やまだ たろう"
              />
            </div>

            <TextField
              label="メールアドレス"
              type="email"
              value={formData.email}
              onChange={(val) => handleChange('email', val)}
              required
              placeholder="example@email.com"
            />

            <TextField
              label="電話番号"
              type="tel"
              value={formData.phone}
              onChange={(val) => handleChange('phone', val)}
              required
              placeholder="090-0000-0000"
            />

            <TextField
              label="住所"
              value={formData.address}
              onChange={(val) => handleChange('address', val)}
              required
              placeholder="東京都渋谷区..."
            />

            <TextField
              label="パスワード"
              type="password"
              value={formData.password}
              onChange={(val) => handleChange('password', val)}
              required
              placeholder="8文字以上"
            />

            <TextField
              label="パスワード（確認）"
              type="password"
              value={formData.passwordConfirm}
              onChange={(val) => handleChange('passwordConfirm', val)}
              required
              placeholder="パスワードを再入力"
            />

            <div className="pt-2">
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
        </Card>

        {/* Links */}
        <div className="text-center mt-5 space-y-2">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            ライセンスキーをお持ちの方は{' '}
            <Link
              href="/register"
              className="text-[var(--portal-primary,#B91C1C)] font-medium hover:underline"
            >
              こちら
            </Link>
          </p>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
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
    </div>
  )
}
