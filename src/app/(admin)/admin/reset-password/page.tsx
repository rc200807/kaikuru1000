'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'エラーが発生しました')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/admin/login'), 3000)
    } catch {
      setError('サーバーエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <MessageBanner severity="error">
          無効なリセットリンクです。もう一度パスワードリセットをリクエストしてください。
        </MessageBanner>
        <div className="text-center">
          <Link
            href="/admin/forgot-password"
            className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            パスワードリセットを再リクエスト
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {success ? (
        <div className="space-y-4">
          <MessageBanner severity="success">
            パスワードが正常にリセットされました。3秒後にログインページへ移動します...
          </MessageBanner>
          <div className="text-center">
            <Link
              href="/admin/login"
              className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            >
              今すぐログインページへ
            </Link>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <MessageBanner severity="error" className="mb-6">
              {error}
            </MessageBanner>
          )}

          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 leading-relaxed">
            新しいパスワードを入力してください。
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="新しいパスワード"
              type="password"
              value={password}
              onChange={setPassword}
              required
              placeholder="8文字以上"
            />
            <TextField
              label="新しいパスワード（確認）"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              placeholder="もう一度入力"
            />
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              fullWidth
              size="lg"
            >
              {loading ? 'リセット中...' : 'パスワードをリセット'}
            </Button>
          </form>
        </>
      )}
    </>
  )
}

export default function AdminResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img loading="lazy" decoding="async" src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">パスワード再設定</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-widest uppercase mb-1">
              Admin Portal
            </p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">新しいパスワードを設定</p>
          </div>

          <Suspense fallback={
            <div className="text-center py-8 text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</div>
          }>
            <ResetPasswordForm />
          </Suspense>
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
