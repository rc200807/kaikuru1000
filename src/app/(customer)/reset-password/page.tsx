'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MessageBanner from '@/components/MessageBanner'
import { validatePassword, PASSWORD_RULE } from '@/lib/passwordValidation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

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

    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }

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
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('サーバーエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <>
        <MessageBanner severity="error">
          無効なリセットリンクです。もう一度パスワードリセットをリクエストしてください。
        </MessageBanner>
        <div className="text-center mt-4">
          <Link href="/login" className="text-sm text-red-500/80 hover:text-red-600">
            ログインページへ戻る
          </Link>
        </div>
      </>
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
            <Link href="/login" className="text-sm text-red-500/80 hover:text-red-600">
              今すぐログインページへ
            </Link>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-6">
              <MessageBanner severity="error">{error}</MessageBanner>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <GlassInput
              label="新しいパスワード"
              type="password"
              value={password}
              onChange={setPassword}
              required
              placeholder={PASSWORD_RULE}
            />
            <GlassInput
              label="新しいパスワード（確認）"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              placeholder="もう一度入力"
            />
            <GlassButton type="submit" variant="primary" disabled={loading} loading={loading}>
              {loading ? 'リセット中...' : 'パスワードをリセット'}
            </GlassButton>
          </form>
        </>
      )}
    </>
  )
}

export default function CustomerResetPasswordPage() {
  return (
    <GlassBackground>
      {/* Title */}
      <div className="text-center mb-6">
        <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mt-1">パスワード再設定</p>
      </div>

      <Suspense fallback={
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      }>
        <ResetPasswordForm />
      </Suspense>

      <div className="text-center mt-5">
        <Link href="/login" className="text-sm text-red-500/80 hover:text-red-600">
          ← ログインページへ
        </Link>
      </div>
    </GlassBackground>
  )
}
