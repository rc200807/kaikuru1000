'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

export default function AnalyticsSettingsPage() {
  const [gaTrackingId, setGaTrackingId] = useState('')
  const [gaOriginal, setGaOriginal] = useState('')
  const [gaSaving, setGaSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/site-config')
      .then(r => r.json())
      .then(data => {
        setGaTrackingId(data.gaTrackingId || '')
        setGaOriginal(data.gaTrackingId || '')
      })
      .catch(() => {})
  }, [])

  async function handleSaveGa(e: React.FormEvent) {
    e.preventDefault()
    setGaSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaTrackingId }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: gaTrackingId ? 'Google Analytics設定を保存しました' : 'Google Analyticsを無効化しました' })
        setGaOriginal(gaTrackingId)
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setGaSaving(false)
  }

  return (
    <SettingsShell title="Google Analytics">
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M20 4H4v16h16V4z" fill="none" />
            <path d="M7.5 17.5V14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <path d="M12 17.5V10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <path d="M16.5 17.5V6.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">Google Analytics</h3>
          {gaOriginal && (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-completed-text)]" />
              有効
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
          トラッキングIDを入力するだけで、サイト全体のアクセス解析が有効になります。
        </p>

        <form onSubmit={handleSaveGa} className="space-y-4 max-w-lg ml-8">
          <TextField
            label="トラッキングID"
            value={gaTrackingId}
            onChange={setGaTrackingId}
            placeholder="G-XXXXXXXXXX"
            helper="Google AnalyticsのトラッキングID（測定ID）を入力してください。空にすると無効化されます。"
          />

          {gaOriginal && (
            <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">
              現在の設定: {gaOriginal}
            </div>
          )}

          <Button variant="filled" type="submit" loading={gaSaving}>
            {gaTrackingId ? '設定を保存' : 'Analytics を無効化'}
          </Button>
        </form>
      </Card>
    </SettingsShell>
  )
}
