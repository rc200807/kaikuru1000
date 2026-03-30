'use client'

import { useState } from 'react'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userType: 'admin' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'エラーが発生しました')
      } else {
        setSent(true)
      }
    } catch {
      setError('サーバーエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">パスワードリセット</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-widest uppercase mb-1">
              Admin Portal
            </p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">パスワードをリセット</p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <MessageBanner severity="success">
                パスワードリセットのメールを送信しました。メールに記載されたリンクから新しいパスワードを設定してください。
              </MessageBanner>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                メールが届かない場合は、迷惑メールフォルダをご確認ください。数分経っても届かない場合は、メールアドレスをご確認の上、もう一度お試しください。
              </p>
            </div>
          ) : (
            <>
              {error && (
                <MessageBanner severity="error" className="mb-6">
                  {error}
                </MessageBanner>
              )}

              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 leading-relaxed">
                登録されているメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <TextField
                  label="メールアドレス"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                  placeholder="admin@kaikuru.jp"
                />
                <Button
                  type="submit"
                  disabled={loading || !email.trim()}
                  loading={loading}
                  fullWidth
                  size="lg"
                >
                  {loading ? '送信中...' : 'リセットメールを送信'}
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="text-center mt-5 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          <Link href="/admin/login" className="hover:text-[var(--md-sys-color-on-surface)] transition-colors">
            ← ログインページへ戻る
          </Link>
        </p>
      </div>
    </div>
  )
}
