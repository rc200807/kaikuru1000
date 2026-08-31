'use client'

/**
 * 店舗ポータルのログインフォーム。
 * 店舗専用ログイン画面（/store/login/[storeCode]）から店舗を渡して使う。
 *
 * 店舗が確定していることが前提。メールアドレスは店舗内でのみ一意なので
 * （@@unique([storeId, email])）、同じアドレスが別の店舗でも使われている場合があり、
 * 店舗を決めずにログインすると「どの店舗に入るのか」が曖昧になる。
 * signIn には店舗コードを必ず渡し、その店舗のオーナー／スタッフだけを照合対象にする。
 */

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import PasskeyLoginButton from '@/components/PasskeyLoginButton'

/** ログイン後にこの店舗をログイン画面の初期選択として覚えておくキー */
export const LAST_STORE_CODE_KEY = 'storeLoginLastCode'

export default function StoreLoginForm({ store }: { store: { code: string; name: string } }) {
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
        // 店舗コードを渡してこの店舗のアカウントだけをリセット対象にする
        // （同じメールが他店舗でも使われている場合に巻き添えで変えてしまわないため）
        body: JSON.stringify({ email: resetEmail, userType: 'store', storeCode: store.code }),
      })
      setResetMessage('パスワードリセット用のメールを送信しました')
    } catch {
      setResetMessage('エラーが発生しました。もう一度お試しください')
    } finally {
      setResetLoading(false)
    }
  }

  /**
   * ログイン後の遷移先。middleware が付けた ?callbackUrl= があればそこへ戻す
   * （自動ログアウト前に見ていた画面に復帰できる）。
   * 外部サイトへ飛ばされないよう /store/ 配下だけを許可する。
   */
  function loginDestination(): string {
    const cb = new URLSearchParams(window.location.search).get('callbackUrl')
    return cb && cb.startsWith('/store/') && !cb.startsWith('/store/login') ? cb : '/store/dashboard'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('store', {
      email, password,
      storeCode: store.code,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      // 次回このログイン画面を開いたときの初期選択に使う
      try { localStorage.setItem(LAST_STORE_CODE_KEY, store.code) } catch { /* プライベートモード等は無視 */ }
      // ログイン直後はハード遷移する。
      // SessionProvider がルート(providers.tsx)と StoreShell で入れ子になっており、
      // next-auth の signIn が更新するのは片方だけ（__NEXTAUTH._getSession はモジュール変数で
      // 後からマウントした側に上書きされる）。画面が読むのはサーバー描画時のセッション＝
      // ログイン画面表示時点の null のままなので、router.push だと遷移先が未ログイン扱いになり
      // ログイン画面へ戻されていた（2回目で入れるのはその間にレイアウトが再取得されるため）。
      // ハード遷移ならサーバーが新しいCookieでレイアウトごと描き直すので確実に入れる。
      window.location.assign(loginDestination())
    }
  }

  /** 「店舗を変更」— 選択画面へ戻る。callbackUrl は引き継ぐ */
  function changeStoreHref(): string {
    if (typeof window === 'undefined') return '/store/login'
    const cb = new URLSearchParams(window.location.search).get('callbackUrl')
    return cb ? `/store/login?callbackUrl=${encodeURIComponent(cb)}` : '/store/login'
  }

  return (
    <Card variant="elevated" padding="lg">
      <div className="mb-6">
        <p className="text-xs font-medium text-[var(--portal-primary)] tracking-widest uppercase mb-1">Store Portal</p>
        <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">{store.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">店舗コード {store.code}</span>
          <a href={changeStoreHref()} className="text-xs text-[var(--portal-primary)] hover:underline">店舗を変更</a>
        </div>
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
                {store.name}に登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
              </p>
              <TextField
                label="メールアドレス"
                type="email"
                value={resetEmail}
                onChange={setResetEmail}
                required
                placeholder="store@kaikuru.jp"
              />
              <Button type="submit" disabled={resetLoading} loading={resetLoading} fullWidth size="lg">
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
              placeholder="store@kaikuru.jp"
            />
            <TextField
              label="パスワード"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
            <Button type="submit" disabled={loading} loading={loading} fullWidth size="lg">
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
  )
}
