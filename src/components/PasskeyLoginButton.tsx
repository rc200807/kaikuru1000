'use client'

/**
 * パスキーログインボタン
 *
 * 1. /api/auth/webauthn/login/options でチャレンジを取得
 * 2. navigator.credentials.get()（ブラウザ/OSの認証UI: Face ID・指紋・PIN等）
 * 3. /api/auth/webauthn/login/verify で検証しワンタイムトークンを取得
 * 4. signIn('webauthn') で NextAuth セッション発行（30日）
 */

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import Button from '@/components/Button'

type PasskeyPortal = 'admin' | 'sysadmin' | 'store'

/**
 * パスキーログインの共通フロー。
 * 戻り値: ok=true でセッション発行済み / cancelled=true はユーザーキャンセル（エラー表示不要）
 */
export async function loginWithPasskey(
  portal: PasskeyPortal,
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const optionsRes = await fetch('/api/auth/webauthn/login/options', { method: 'POST' })
    if (!optionsRes.ok) {
      const data = await optionsRes.json().catch(() => null)
      return { ok: false, error: data?.error || 'パスキーの準備に失敗しました' }
    }
    const optionsJSON = await optionsRes.json()

    let authResponse
    try {
      authResponse = await startAuthentication({ optionsJSON })
    } catch (err: any) {
      // ユーザーによるキャンセルはエラー表示しない
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        return { ok: false, cancelled: true }
      }
      return { ok: false, error: 'パスキー認証がキャンセルまたは失敗しました' }
    }

    const verifyRes = await fetch('/api/auth/webauthn/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal, response: authResponse }),
    })
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => null)
      return { ok: false, error: data?.error || 'パスキーの検証に失敗しました' }
    }
    const { loginToken } = await verifyRes.json()

    const result = await signIn('webauthn', { token: loginToken, redirect: false })
    if (result?.error) {
      return { ok: false, error: 'ログインに失敗しました。もう一度お試しください' }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'パスキーログインに失敗しました' }
  }
}

type Props = {
  portal: PasskeyPortal
  callbackUrl: string
  onError?: (message: string) => void
}

export default function PasskeyLoginButton({ portal, callbackUrl, onError }: Props) {
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
  }, [])

  if (!supported) return null

  async function handleClick() {
    setLoading(true)
    const result = await loginWithPasskey(portal)
    setLoading(false)
    if (result.ok) {
      // ログイン直後はハード遷移する。
      // SessionProvider がルート(providers.tsx)と各Shellで入れ子になっており、
      // next-auth の signIn が更新するのは片方だけ（__NEXTAUTH._getSession はモジュール変数で
      // 後からマウントした側に上書きされる）。画面が読むのはサーバー描画時のセッション＝
      // ログイン画面表示時点の null のままなので、router.push だと遷移先が未ログイン扱いになり
      // ログイン画面へ戻されていた（2回目で入れるのはその間にレイアウトが再取得されるため）。
      // ハード遷移ならサーバーが新しいCookieでレイアウトごと描き直すので確実に入れる。
      window.location.assign(callbackUrl)
    } else if (!result.cancelled) {
      onError?.(result.error || 'パスキーログインに失敗しました')
    }
  }

  return (
    <Button
      type="button"
      variant="outlined"
      fullWidth
      size="lg"
      disabled={loading}
      loading={loading}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-2">
        {/* 指紋アイコン */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 11c0 3.5-.5 6.5-2 9" />
          <path d="M8.5 20c1.2-2.3 1.5-5 1.5-9a2 2 0 0 1 4 0c0 1 0 2-.1 3" />
          <path d="M15.5 17.5c.3-1.5.5-3.5.5-6.5a4 4 0 0 0-8 0c0 1 0 2-.2 3" />
          <path d="M5 14.5c.3-1 .5-2.2.5-3.5a6.5 6.5 0 0 1 13 0c0 .7 0 1.4-.1 2" />
          <path d="M12 2a9 9 0 0 0-9 9" />
          <path d="M21 11a9 9 0 0 0-4.5-7.8" />
        </svg>
        {loading ? '認証中...' : 'パスキーでログイン（30日間有効）'}
      </span>
    </Button>
  )
}
