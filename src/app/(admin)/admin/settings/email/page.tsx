'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type EmailConfig = {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  fromAddress: string
  fromName: string
  enabled: boolean
  hasPassword: boolean
}

export default function EmailSettingsPage() {
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    smtpHost: '', smtpPort: 587, smtpUser: '', fromAddress: '', fromName: '買いクル 本部', enabled: false, hasPassword: false,
  })
  const [emailForm, setEmailForm] = useState({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', fromAddress: '', fromName: '買いクル 本部', enabled: false,
  })
  const [emailSaving, setEmailSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function fetchEmailConfig() {
    fetch('/api/admin/email-config')
      .then(r => r.json())
      .then(data => {
        setEmailConfig(data)
        setEmailForm({
          smtpHost: data.smtpHost || '',
          smtpPort: String(data.smtpPort || 587),
          smtpUser: data.smtpUser || '',
          smtpPass: '',
          fromAddress: data.fromAddress || '',
          fromName: data.fromName || '買いクル 本部',
          enabled: data.enabled ?? false,
        })
      })
      .catch(() => {})
  }

  useEffect(() => { fetchEmailConfig() }, [])

  async function handleSaveEmailConfig(e: React.FormEvent) {
    e.preventDefault()
    setEmailSaving(true)
    setMessage(null)

    const res = await fetch('/api/admin/email-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtpHost: emailForm.smtpHost,
        smtpPort: Number(emailForm.smtpPort),
        smtpUser: emailForm.smtpUser,
        smtpPass: emailForm.smtpPass || undefined,
        fromAddress: emailForm.fromAddress,
        fromName: emailForm.fromName,
        enabled: emailForm.enabled,
      }),
    })
    setEmailSaving(false)

    if (res.ok) {
      setMessage({ type: 'success', text: 'メール設定を保存しました' })
      setEmailForm(prev => ({ ...prev, smtpPass: '' }))
      fetchEmailConfig()
    } else {
      setMessage({ type: 'error', text: 'メール設定の保存に失敗しました' })
    }
  }

  async function handleSendTestEmail() {
    if (!testEmail) return
    setTestSending(true)
    setMessage(null)

    const res = await fetch('/api/admin/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toEmail: testEmail }),
    })
    const data = await res.json()
    setTestSending(false)

    if (res.ok) {
      setMessage({ type: 'success', text: data.message })
    } else {
      setMessage({ type: 'error', text: data.error || 'テストメールの送信に失敗しました' })
    }
  }

  return (
    <SettingsShell title="メール通知設定">
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">メール通知設定</h3>
          <span className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            emailConfig.enabled
              ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
              : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${emailConfig.enabled ? 'bg-[var(--status-completed-text)]' : 'bg-[var(--md-sys-color-outline)]'}`} />
            {emailConfig.enabled ? '通知ON' : '通知OFF'}
          </span>
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
          顧客が店舗に割り当てられたとき、担当店舗にメールで通知します。SMTPサーバーの設定が必要です。
        </p>

        <form onSubmit={handleSaveEmailConfig} className="space-y-5 max-w-lg ml-8">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setEmailForm(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${emailForm.enabled ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-[var(--toggle-thumb,#fff)] rounded-full shadow transition-transform ${emailForm.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
              {emailForm.enabled ? '割り当て時にメールを送信する' : 'メール通知は無効'}
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="col-span-2">
              <TextField label="SMTPホスト" value={emailForm.smtpHost} onChange={(v) => setEmailForm({ ...emailForm, smtpHost: v })} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">ポート</label>
              <select
                value={emailForm.smtpPort}
                onChange={e => setEmailForm({ ...emailForm, smtpPort: e.target.value })}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                <option value="587">587 (TLS)</option>
                <option value="465">465 (SSL)</option>
                <option value="25">25</option>
              </select>
            </div>
          </div>

          <TextField label="SMTPユーザー名（メールアドレス）" value={emailForm.smtpUser} onChange={(v) => setEmailForm({ ...emailForm, smtpUser: v })} type="email" placeholder="noreply@kaikuru.jp" />

          <TextField
            label={emailConfig.hasPassword ? 'SMTPパスワード（設定済み）' : 'SMTPパスワード'}
            value={emailForm.smtpPass}
            onChange={(v) => setEmailForm({ ...emailForm, smtpPass: v })}
            type="password"
            placeholder={emailConfig.hasPassword ? '変更しない場合は空白のまま' : 'パスワードを入力...'}
            helper={emailConfig.hasPassword ? '変更する場合のみ入力してください' : undefined}
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField label="送信元メールアドレス" value={emailForm.fromAddress} onChange={(v) => setEmailForm({ ...emailForm, fromAddress: v })} type="email" placeholder="noreply@kaikuru.jp" helper="空白の場合はSMTPユーザー名を使用" />
            <TextField label="送信元表示名" value={emailForm.fromName} onChange={(v) => setEmailForm({ ...emailForm, fromName: v })} placeholder="買いクル 本部" />
          </div>

          <Button variant="filled" type="submit" loading={emailSaving}>設定を保存</Button>
        </form>

        <div className="mt-6 pt-6 border-t border-[var(--md-sys-color-outline-variant)] ml-8">
          <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3">テスト送信</h4>
          <div className="flex gap-3 max-w-lg items-end">
            <div className="flex-1">
              <TextField label="送信先メールアドレス" value={testEmail} onChange={setTestEmail} type="email" placeholder="test@example.com" />
            </div>
            <Button variant="tonal" loading={testSending} disabled={!testEmail} onClick={handleSendTestEmail} className="flex-shrink-0">
              テスト送信
            </Button>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">設定を保存後、指定したアドレスにテストメールを送信します</p>
        </div>
      </Card>
    </SettingsShell>
  )
}
