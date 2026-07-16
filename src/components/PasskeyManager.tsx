'use client'

/**
 * パスキー管理（登録・一覧・削除）
 * admin / store / sysadmin のプロフィール（設定）画面に設置する。
 */

import { useCallback, useEffect, useState } from 'react'
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

type Credential = {
  id: string
  deviceName: string | null
  deviceType: string | null
  backedUp: boolean
  lastUsedAt: string | null
  createdAt: string
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

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

export default function PasskeyManager() {
  const [supported, setSupported] = useState(false)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loaded, setLoaded] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/webauthn/credentials')
      if (res.ok) {
        const data = await res.json()
        setCredentials(data.credentials ?? [])
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
    setDeviceName(suggestDeviceName())
    load()
  }, [load])

  async function handleRegister() {
    setError('')
    setMessage('')
    setRegistering(true)
    try {
      const optionsRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' })
      if (!optionsRes.ok) {
        const data = await optionsRes.json().catch(() => null)
        throw new Error(data?.error || 'パスキーの準備に失敗しました')
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
        if (err?.name === 'InvalidStateError') {
          throw new Error('このデバイスは既に登録されています')
        }
        throw new Error('パスキーの作成がキャンセルまたは失敗しました')
      }

      const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: regResponse, deviceName }),
      })
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => null)
        throw new Error(data?.error || 'パスキーの登録に失敗しました')
      }

      setMessage('パスキーを登録しました。次回から「パスキーでログイン」で30日間ログイン状態が維持されます')
      await load()
    } catch (err: any) {
      setError(err?.message || 'パスキーの登録に失敗しました')
    } finally {
      setRegistering(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('このパスキーを削除しますか？該当デバイスからはパスキーでログインできなくなります。')) return
    setError('')
    setMessage('')
    const res = await fetch(`/api/auth/webauthn/credentials/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage('パスキーを削除しました')
      await load()
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error || 'パスキーの削除に失敗しました')
    }
  }

  if (!loaded) return null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">パスキー（デバイス認証）</h3>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1">
          Face ID・指紋・PIN などのデバイス認証でログインできます。パスキーでログインすると30日間再ログイン不要になります。
        </p>
      </div>

      {error && <MessageBanner severity="error">{error}</MessageBanner>}
      {message && <MessageBanner severity="success">{message}</MessageBanner>}

      {credentials.length > 0 && (
        <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)]">
          {credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">
                  {c.deviceName || '名称未設定のデバイス'}
                  {c.backedUp && (
                    <span className="ml-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">（クラウド同期）</span>
                  )}
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                  登録: {formatDate(c.createdAt)} ／ 最終利用: {formatDate(c.lastUsedAt)}
                </p>
              </div>
              <Button type="button" variant="text" size="sm" onClick={() => handleDelete(c.id)}>
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="flex-1 block">
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
            variant="tonal"
            disabled={registering}
            loading={registering}
            onClick={handleRegister}
          >
            {registering ? '登録中...' : 'このデバイスを登録'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          このブラウザはパスキーに対応していません。
        </p>
      )}
    </div>
  )
}
