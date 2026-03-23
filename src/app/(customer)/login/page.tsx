'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'

export default function CustomerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    setResetMessage('')
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, userType: 'customer' }),
      })
      setResetMessage('パスワードリセット用のメールを送信しました')
    } catch {
      setResetMessage('エラーが発生しました。もう一度お試しください')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('customer', {
      email, password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      router.push('/mypage')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface,#FFFBFE)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
            顧客マイページ ログイン
          </p>
        </div>

        {/* Login card */}
        <Card variant="elevated" padding="lg">
          {error && (
            <div className="mb-6">
              <MessageBanner severity="error">{error}</MessageBanner>
            </div>
          )}

          {showForgotPassword ? (
            <div className="space-y-5">
              {resetMessage ? (
                <MessageBanner severity="success">{resetMessage}</MessageBanner>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                    登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
                  </p>
                  <TextField
                    label="メールアドレス"
                    type="email"
                    value={resetEmail}
                    onChange={setResetEmail}
                    required
                    placeholder="example@email.com"
                  />
                  <Button
                    type="submit"
                    disabled={resetLoading}
                    loading={resetLoading}
                    fullWidth
                    size="lg"
                  >
                    {resetLoading ? '送信中...' : 'リセットメールを送信'}
                  </Button>
                </form>
              )}
              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setResetMessage('') }}
                className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors w-full text-center"
              >
                ← ログインに戻る
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <TextField
                  label="メールアドレス"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                  placeholder="example@email.com"
                />

                <TextField
                  label="パスワード"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  required
                  placeholder="パスワードを入力"
                />

                <Button
                  type="submit"
                  disabled={loading}
                  loading={loading}
                  fullWidth
                  size="lg"
                >
                  {loading ? 'ログイン中...' : 'ログイン'}
                </Button>
              </form>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-[var(--portal-primary,#B91C1C)] hover:underline"
                >
                  パスワードをお忘れですか？
                </button>
              </div>

              <div className="text-center mt-4 space-y-2">
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  アカウントをお持ちでない方は{' '}
                  <Link
                    href="/register"
                    className="text-[var(--portal-primary,#B91C1C)] font-medium hover:underline"
                  >
                    新規登録
                  </Link>
                </p>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  ライセンスキーをお持ちでない方は{' '}
                  <Link
                    href="/register-regular"
                    className="text-[var(--portal-primary,#B91C1C)] font-medium hover:underline"
                  >
                    通常会員登録
                  </Link>
                </p>
              </div>
            </>
          )}
        </Card>

        {/* Back link */}
        <p className="text-center mt-5 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          <Link
            href="/"
            className="hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            &#8592; トップページへ
          </Link>
        </p>
      </div>
    </div>
  )
}
