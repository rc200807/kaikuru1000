'use client'

import { useState, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import PasskeyLoginButton from '@/components/PasskeyLoginButton'
import LoginFooter from '@/components/LoginFooter'
import { loginErrorMessage, ADMIN_LOGIN_REQUEST_REQUIRED } from '@/lib/login-error'

/** 承認待ちの状態確認の間隔 */
const POLL_MS = 3000

type PendingRequest = { requestId: string; token: string; code: string; expiresAt: string; name: string }

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // ID+パスワード方式: 承認待ちのログインリクエスト（申請端末だけが token を持つ）
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const finishingRef = useRef(false)

  // 承認待ちの間、状態をポーリング。承認されたらそのままログインを確定する
  useEffect(() => {
    if (!pending) return
    let stopped = false
    finishingRef.current = false

    async function check() {
      if (stopped || finishingRef.current || !pending) return
      try {
        const res = await fetch('/api/auth/admin-login-request/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: pending.requestId, token: pending.token }),
        })
        if (stopped) return
        const data = await res.json().catch(() => ({}))
        const st = res.ok ? data.status : 'expired'
        if (st === 'approved') {
          finishingRef.current = true
          const result = await signIn('admin-login-request', {
            requestId: pending.requestId, token: pending.token, redirect: false,
          })
          if (result?.error) {
            finishingRef.current = false
            setPending(null)
            setError('ログインを確定できませんでした。もう一度ログインしてください')
          } else {
            // 通常ログインと同じ理由でハード遷移（下の handleSubmit のコメント参照）
            window.location.assign('/admin/dashboard')
          }
        } else if (st === 'rejected') {
          setPending(null)
          setError(`ログインリクエストは${data.decidedByName ? `${data.decidedByName} さんにより` : ''}却下されました`)
        } else if (st === 'expired' || st === 'cancelled' || st === 'used') {
          setPending(null)
          setError('ログインリクエストの有効期限が切れました。もう一度ログインしてください')
        }
      } catch {
        // 通信エラーは次回ポーリングで再試行
      }
    }

    check()
    const poll = setInterval(check, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { stopped = true; clearInterval(poll); clearInterval(tick) }
  }, [pending])

  async function sendLoginRequest(): Promise<void> {
    const res = await fetch('/api/auth/admin-login-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'ログインリクエストを送信できませんでした')
      return
    }
    setPassword('')
    setNow(Date.now())
    setPending(data as PendingRequest)
  }

  async function cancelLoginRequest() {
    if (!pending) return
    const p = pending
    setPending(null)
    await fetch('/api/auth/admin-login-request/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: p.requestId, token: p.token, cancel: true }),
    }).catch(() => {})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('admin', {
      email, password,
      redirect: false,
    })

    if (result?.error === ADMIN_LOGIN_REQUEST_REQUIRED) {
      // ID+パスワード方式: ID/パスワードは正しい。管理者の承認を求めるリクエストを出す
      await sendLoginRequest()
      setLoading(false)
      return
    }

    setLoading(false)

    if (result?.error) {
      setError(loginErrorMessage(result.error, 'メールアドレスまたはパスワードが間違っています'))
    } else {
      // ログイン直後はハード遷移する。
      // SessionProvider がルート(providers.tsx)と各Shellで入れ子になっており、
      // next-auth の signIn が更新するのは片方だけ（__NEXTAUTH._getSession はモジュール変数で
      // 後からマウントした側に上書きされる）。画面が読むのはサーバー描画時のセッション＝
      // ログイン画面表示時点の null のままなので、router.push だと遷移先が未ログイン扱いになり
      // ログイン画面へ戻されていた（2回目で入れるのはその間にレイアウトが再取得されるため）。
      // ハード遷移ならサーバーが新しいCookieでレイアウトごと描き直すので確実に入れる。
      window.location.assign('/admin/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img loading="lazy" decoding="async" src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">本部管理者ログイン</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-widest uppercase mb-1">
              Admin Portal
            </p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">管理者ポータル</p>
          </div>

          {error && (
            <MessageBanner severity="error" className="mb-6">
              {error}
            </MessageBanner>
          )}

          {pending ? (
            <LoginRequestWaiting
              pending={pending}
              remainingMs={new Date(pending.expiresAt).getTime() - now}
              onCancel={cancelLoginRequest}
            />
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="メールアドレス または ログインID"
              type="text"
              value={email}
              onChange={setEmail}
              required
              placeholder="admin@kaikuru.jp"
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
            <PasskeyLoginButton portal="admin" callbackUrl="/admin/dashboard" onError={setError} />
          </div>

          <div className="text-center mt-4 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
            <Link
              href="/admin/forgot-password"
              className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            >
              パスワードを忘れた方はこちら
            </Link>
          </div>
          </>
          )}
        </Card>

        <LoginFooter />
      </div>
    </div>
  )
}

/** ID+パスワード方式: 管理者の承認待ち画面 */
function LoginRequestWaiting({
  pending,
  remainingMs,
  onCancel,
}: {
  pending: PendingRequest
  remainingMs: number
  onCancel: () => void
}) {
  const sec = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = Math.floor(sec / 60)
  const ss = String(sec % 60).padStart(2, '0')
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="relative mt-1 flex h-3 w-3 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
            ログインリクエストを送信しました
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {pending.name} さんのログインには、管理者の承認が必要です。
            管理者に連絡し、管理画面の「ログインリクエスト」から承認してもらってください。
            承認されると自動でログインします。
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-4 text-center">
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">確認コード</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-[var(--md-sys-color-on-surface)]">
          {pending.code}
        </p>
        <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          承認する管理者の画面にも同じコードが表示されます
        </p>
      </div>

      <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
        有効期限まで残り {mm}:{ss}
      </p>

      <Button variant="outlined" fullWidth onClick={onCancel}>
        キャンセル
      </Button>
    </div>
  )
}
