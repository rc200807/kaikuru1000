'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import PasskeyLoginButton from '@/components/PasskeyLoginButton'
import LoginFooter from '@/components/LoginFooter'

export default function StoreLoginPage() {
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
        body: JSON.stringify({ email: resetEmail, userType: 'store' }),
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

    const result = await signIn('store', {
      email, password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      router.push('/store/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">店舗スタッフ ログイン</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--portal-primary)] tracking-widest uppercase mb-1">Store Portal</p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">店舗ポータル</p>
          </div>

          {error && (
            <MessageBanner severity="error" className="mb-6">
              {error}
            </MessageBanner>
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
                    label="店舗メールアドレス"
                    type="email"
                    value={resetEmail}
                    onChange={setResetEmail}
                    required
                    placeholder="store@kaikuru.jp"
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
                  label="店舗メールアドレス"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                  placeholder="store@kaikuru.jp"
                />
                <TextField
                  label="パスワード"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  required
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
              <div className="mt-4">
                <PasskeyLoginButton portal="store" callbackUrl="/store/dashboard" onError={setError} />
              </div>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-[var(--portal-primary)] hover:underline"
                >
                  パスワードをお忘れですか？
                </button>
              </div>
            </>
          )}
        </Card>

        <LoginFooter />
      </div>
    </div>
  )
}
