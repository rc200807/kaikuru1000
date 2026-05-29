'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

export default function RakutenSettingsPage() {
  const [rakutenAppId, setRakutenAppId] = useState('')
  const [rakutenOriginal, setRakutenOriginal] = useState('')
  const [rakutenSaving, setRakutenSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/site-config')
      .then(r => r.json())
      .then(data => {
        setRakutenAppId(data.rakutenAppId || '')
        setRakutenOriginal(data.rakutenAppId || '')
      })
      .catch(() => {})
  }, [])

  async function handleSaveRakuten(e: React.FormEvent) {
    e.preventDefault()
    setRakutenSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rakutenAppId }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: rakutenAppId ? '楽天API設定を保存しました' : '楽天API設定をクリアしました' })
        setRakutenOriginal(rakutenAppId)
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setRakutenSaving(false)
  }

  return (
    <SettingsShell title="楽天商品検索API">
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">楽天商品検索API（バーコード連携）</h3>
          {rakutenOriginal ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">設定済み</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">未設定</span>
          )}
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4 ml-8">
          バーコード（JANコード）スキャンで商品情報を自動取得できます。
        </p>
        <form onSubmit={handleSaveRakuten} className="ml-8 space-y-4">
          <TextField
            label="楽天アプリケーションID"
            value={rakutenAppId}
            onChange={(v) => setRakutenAppId(v)}
            placeholder="例: 1234567890123456789"
            helper="楽天Webサービス（https://webservice.rakuten.co.jp/）からアプリIDを発行して入力してください。"
          />
          <Button type="submit" variant="filled" loading={rakutenSaving} disabled={rakutenSaving || rakutenAppId === rakutenOriginal}>
            {rakutenAppId ? '設定を保存' : '設定をクリア'}
          </Button>
        </form>
      </Card>
    </SettingsShell>
  )
}
