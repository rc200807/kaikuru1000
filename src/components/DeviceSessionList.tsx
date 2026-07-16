'use client'

/**
 * ログイン中デバイス（長期セッション）一覧・失効
 * パスキーで発行された30日セッションを一覧表示し、遠隔で失効できる。
 */

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

type Device = {
  id: string
  loginMethod: string
  ip: string | null
  userAgent: string | null
  deviceName: string | null
  lastSeenAt: string
  expiresAt: string
  createdAt: string
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function describeUserAgent(ua: string | null): string {
  if (!ua) return '不明なデバイス'
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : 'ブラウザ'
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : 'OS不明'
  return `${os} / ${browser}`
}

export default function DeviceSessionList() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/devices')
      if (res.ok) {
        const data = await res.json()
        setDevices(data.devices ?? [])
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleRevoke(id: string) {
    if (!confirm('このデバイスのログイン状態を解除しますか？該当デバイスは次の操作から再ログインが必要になります。')) return
    setError('')
    const res = await fetch(`/api/auth/devices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      await load()
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error || 'ログイン解除に失敗しました')
    }
  }

  if (!loaded || (devices.length === 0 && !error)) return null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">ログイン中のデバイス</h3>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1">
          パスキーで長期ログイン中のデバイスです。紛失時などはここからログイン状態を解除できます。
        </p>
      </div>

      {error && <MessageBanner severity="error">{error}</MessageBanner>}

      <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)]">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">
                {d.deviceName || describeUserAgent(d.userAgent)}
                <span className="ml-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {d.deviceName ? describeUserAgent(d.userAgent) : ''}
                </span>
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                最終利用: {formatDate(d.lastSeenAt)} ／ 有効期限: {formatDate(d.expiresAt)}
                {d.ip ? ` ／ IP: ${d.ip}` : ''}
              </p>
            </div>
            <Button type="button" variant="text" size="sm" onClick={() => handleRevoke(d.id)}>
              ログイン解除
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
