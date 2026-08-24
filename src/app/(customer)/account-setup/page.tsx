'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import MessageBanner from '@/components/MessageBanner'
import { PASSWORD_RULE, validatePassword } from '@/lib/passwordValidation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

function AccountSetupInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/mypage'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (status === 'loading') {
    return (
      <div className="text-center py-4">
        <div className="inline-block w-10 h-10 border-4 border-white/40 border-t-red-500 rounded-full animate-spin mb-4" />
        <p className="text-gray-600 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-bold text-gray-800 mb-2">セッションが見つかりません</h1>
        <p className="text-gray-500 text-sm mb-6">マイページのリンクからもう一度アクセスしてください。</p>
        <GlassButton variant="primary" onClick={() => router.replace('/login')}>ログインページへ</GlassButton>
      </div>
    )
  }

  const user = session.user as any
  if (user.role !== 'customer') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-bold text-gray-800 mb-2">権限がありません</h1>
        <p className="text-gray-500 text-sm mb-6">お客様向けのページです。</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== confirm) { setError('確認用パスワードが一致しません'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${user.id}/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'パスワード設定に失敗しました')
        return
      }
      router.replace(next)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mb-5 p-3 rounded-xl bg-white/50 border border-white/60 text-xs text-gray-600 leading-relaxed">
        マイページに入るためのパスワードを設定してください。<br />
        既に登録済みのパスワードと同じ値を入力した場合はそのままマイページに移動します。<br />
        違うパスワードを入力した場合は新しいパスワードに更新されます。
      </div>

      {error && (
        <div className="mb-4">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <GlassInput
          label="パスワード"
          type="password"
          value={password}
          onChange={(v) => { setPassword(v); setError('') }}
          required
          placeholder={PASSWORD_RULE}
        />
        <GlassInput
          label="パスワード（確認）"
          type="password"
          value={confirm}
          onChange={(v) => { setConfirm(v); setError('') }}
          required
          placeholder="同じパスワードをもう一度入力"
        />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          ルール: {PASSWORD_RULE}
        </p>
        <GlassButton
          variant="primary"
          type="submit"
          disabled={submitting || !password || !confirm}
          loading={submitting}
        >
          {submitting ? '保存中...' : 'パスワードを設定してマイページへ'}
        </GlassButton>
      </form>
    </>
  )
}

export default function AccountSetupPage() {
  return (
    <GlassBackground>
      <div className="text-center mb-6">
        <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mt-1">マイページ用パスワードの設定</p>
      </div>
      <Suspense fallback={<div className="text-center py-8 text-gray-500">読み込み中...</div>}>
        <AccountSetupInner />
      </Suspense>
    </GlassBackground>
  )
}
