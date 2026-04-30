'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import MessageBanner from '@/components/MessageBanner'
import { validatePassword, PASSWORD_RULE } from '@/lib/passwordValidation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

function SetupPasswordForm() {
  const searchParams = useSearchParams()
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
          無効なリンクです。メールに記載のリンクからアクセスしてください。
        </MessageBanner>
        <div className="text-center mt-4">
          <Link href="/login" className="text-sm text-red-500/80 hover:text-red-600">
            ログインページへ
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      {success ? (
        <div className="space-y-6">
          {/* Success icon */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25 mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              パスワードが設定されました
            </h3>
            <p className="text-sm text-gray-500">
              マイページにログインできます
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full text-center py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:from-red-700 hover:to-rose-600 active:scale-[0.98] transition-all"
          >
            ログインページへ
          </Link>
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
              label="パスワード"
              type="password"
              value={password}
              onChange={setPassword}
              required
              placeholder={PASSWORD_RULE}
            />
            <GlassInput
              label="パスワード（確認）"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              placeholder="もう一度入力"
            />
            <GlassButton type="submit" variant="primary" disabled={loading} loading={loading}>
              {loading ? '設定中...' : 'パスワードを設定'}
            </GlassButton>
          </form>
        </>
      )}
    </>
  )
}

export default function SetupPasswordPage() {
  return (
    <GlassBackground>
      {/* Title */}
      <div className="text-center mb-6">
        <img src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mt-1">パスワードを設定</p>
      </div>

      <Suspense fallback={
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      }>
        <SetupPasswordForm />
      </Suspense>
    </GlassBackground>
  )
}
