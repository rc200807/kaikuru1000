'use client'

// ID+パスワード方式アカウントの初回オンボーディング: パスキー登録を必須化する。
// 登録完了後は status を pending_approval へ前進させ、サインアウトして再ログインを促す。
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

function suggestDeviceName(): string {
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Androidスマートフォン'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'このデバイス'
}

export default function AdminPasskeyOnboardingPage() {
  const [supported, setSupported] = useState(true)
  const [deviceName, setDeviceName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
    setDeviceName(suggestDeviceName())
  }, [])

  async function handleRegister() {
    setError('')
    setRegistering(true)
    try {
      const optionsRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' })
      if (!optionsRes.ok) {
        const d = await optionsRes.json().catch(() => null)
        throw new Error(d?.error || 'パスキーの準備に失敗しました')
      }
      const optionsJSON = await optionsRes.json()

      let regResponse
      try {
        regResponse = await startRegistration({ optionsJSON })
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
          setRegistering(false)
          return
        }
        if (err?.name === 'InvalidStateError') throw new Error('このデバイスは既に登録されています')
        throw new Error('パスキーの作成がキャンセルまたは失敗しました')
      }

      const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: regResponse, deviceName }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json().catch(() => null)
        throw new Error(d?.error || 'パスキーの登録に失敗しました')
      }

      // status を pending_approval へ前進
      const completeRes = await fetch('/api/admin/onboarding/passkey-complete', { method: 'POST' })
      if (!completeRes.ok) {
        const d = await completeRes.json().catch(() => null)
        throw new Error(d?.error || '登録の完了処理に失敗しました')
      }

      setDone(true)
      // 一時パスワードセッションを破棄し、パスキーでの再ログインへ
      setTimeout(() => {
        signOut({ callbackUrl: '/admin/login' })
      }, 2500)
    } catch (err: any) {
      setError(err?.message || 'パスキーの登録に失敗しました')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
          <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">初回セットアップ</p>
        </div>

        <Card variant="elevated" padding="lg">
          <h1 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
            パスキーを登録してください
          </h1>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5">
            このアカウントはパスキー（Face ID・指紋・PIN などのデバイス認証）でのログインが必須です。
            まずこのデバイスのパスキーを登録してください。登録後、管理者の承認をもって利用開始となります。
          </p>

          {error && <MessageBanner severity="error" className="mb-4">{error}</MessageBanner>}

          {done ? (
            <MessageBanner severity="success">
              パスキーを登録しました。管理者の承認をお待ちください。ログイン画面に移動します…
            </MessageBanner>
          ) : supported ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">デバイス名（任意）</span>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  maxLength={100}
                  placeholder="例: 事務所のPC"
                  className="mt-1 w-full rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline)] bg-transparent px-3 py-2 text-sm text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#4f8ef7)]"
                />
              </label>
              <Button
                type="button"
                fullWidth
                size="lg"
                disabled={registering}
                loading={registering}
                onClick={handleRegister}
              >
                {registering ? '登録中...' : 'このデバイスのパスキーを登録'}
              </Button>
            </div>
          ) : (
            <MessageBanner severity="warning">
              このブラウザはパスキーに対応していません。対応ブラウザ（最新のChrome/Safari/Edge）で開き直してください。
            </MessageBanner>
          )}

          <div className="text-center mt-5 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            >
              ログアウト
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
