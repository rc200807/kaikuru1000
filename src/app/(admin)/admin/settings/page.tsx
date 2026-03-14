'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'

type GoogleConfig = {
  id: string
  googleEmail: string | null
  isConnected: boolean
  spreadsheetId: string | null
  sheetName: string
  keyColumn: string
  tokenExpiry: string | null
} | null

type EmailConfig = {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  fromAddress: string
  fromName: string
  enabled: boolean
  hasPassword: boolean
}

// スプレッドシートURLからIDを抽出
function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input
}

function AdminSettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [config, setConfig] = useState<GoogleConfig>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // スプレッドシート設定フォーム
  const [sheetForm, setSheetForm] = useState({ spreadsheetUrl: '', sheetName: 'ライセンスキー', keyColumn: 'A' })
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // メール設定
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    smtpHost: '', smtpPort: 587, smtpUser: '', fromAddress: '', fromName: '買いクル 本部', enabled: false, hasPassword: false,
  })
  const [emailForm, setEmailForm] = useState({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', fromAddress: '', fromName: '買いクル 本部', enabled: false,
  })
  const [emailSaving, setEmailSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)

  // OAuth結果パラメータをチェック
  useEffect(() => {
    const successParam = searchParams.get('success')
    const errorParam = searchParams.get('error')
    if (successParam === 'connected') {
      setMessage({ type: 'success', text: 'Googleアカウントの連携が完了しました' })
    } else if (errorParam) {
      const msgs: Record<string, string> = {
        oauth_denied: 'Googleアカウントの連携がキャンセルされました',
        token_failed: 'トークンの取得に失敗しました。もう一度お試しください',
        no_credentials: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません',
      }
      setMessage({ type: 'error', text: msgs[errorParam] || '連携に失敗しました' })
    }
  }, [searchParams])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') { router.push('/'); return }
      fetchConfig()
      fetchEmailConfig()
    }
  }, [status, session])

  function fetchConfig() {
    fetch('/api/admin/google-config')
      .then(r => r.json())
      .then(data => {
        setConfig(data)
        if (data) {
          setSheetForm({
            spreadsheetUrl: data.spreadsheetId || '',
            sheetName: data.sheetName || 'ライセンスキー',
            keyColumn: data.keyColumn || 'A',
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function fetchEmailConfig() {
    fetch('/api/admin/email-config')
      .then(r => r.json())
      .then(data => {
        setEmailConfig(data)
        setEmailForm({
          smtpHost: data.smtpHost || '',
          smtpPort: String(data.smtpPort || 587),
          smtpUser: data.smtpUser || '',
          smtpPass: '',  // パスワードはサーバーから返さない
          fromAddress: data.fromAddress || '',
          fromName: data.fromName || '買いクル 本部',
          enabled: data.enabled ?? false,
        })
      })
      .catch(() => {})
  }

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

  async function handleSaveSheetConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const spreadsheetId = extractSpreadsheetId(sheetForm.spreadsheetUrl)

    const res = await fetch('/api/admin/google-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        sheetName: sheetForm.sheetName,
        keyColumn: sheetForm.keyColumn.toUpperCase(),
      }),
    })
    setSaving(false)

    if (res.ok) {
      setMessage({ type: 'success', text: 'スプレッドシート設定を保存しました' })
      fetchConfig()
    } else {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
  }

  async function handleDisconnect() {
    if (!confirm('Googleアカウントの連携を解除しますか？スプレッドシート設定は保持されます。')) return
    setDisconnecting(true)
    setMessage(null)
    const res = await fetch('/api/admin/google-config', { method: 'DELETE' })
    setDisconnecting(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'Googleアカウントの連携を解除しました' })
      fetchConfig()
    } else {
      setMessage({ type: 'error', text: '解除に失敗しました' })
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const isConnected = config?.isConnected ?? false

  return (
    <>
      <AppBar title="設定" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* メッセージ */}
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
          >
            {message.text}
          </MessageBanner>
        )}

        {/* ─── Google アカウント連携 ─── */}
        <Card variant="elevated" padding="md">
          <div className="flex items-center gap-3 mb-1">
            {/* Google icon */}
            <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">Googleアカウント連携</h3>
            {isConnected && (
              <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-completed-text)]" />
                連携済み
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-9">
            ライセンスキーをGoogleスプレッドシートからインポートするために使用します。
          </p>

          {isConnected ? (
            <div className="ml-9 space-y-4">
              {/* 連携中アカウント情報 */}
              <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-medium)] p-4 border border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[var(--status-completed-bg)] rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{config?.googleEmail}</p>
                    {config?.tokenExpiry && (
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                        トークン有効期限: {format(new Date(config.tokenExpiry), 'yyyy/M/d HH:mm', { locale: ja })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <a
                  href="/api/admin/google-auth"
                  className="text-sm text-[var(--portal-primary,#374151)] hover:opacity-70 underline transition-opacity"
                >
                  別のアカウントで再連携
                </a>
                <span className="text-[var(--md-sys-color-outline)]">|</span>
                <Button
                  variant="text"
                  size="sm"
                  danger
                  loading={disconnecting}
                  onClick={handleDisconnect}
                >
                  連携を解除
                </Button>
              </div>
            </div>
          ) : (
            <div className="ml-9 space-y-4">
              {/* 未連携の説明 */}
              <MessageBanner severity="warning">
                <p className="font-medium mb-2">事前準備が必要です</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Google Cloud Console でプロジェクトを作成</li>
                  <li>「Google Sheets API」と「Google OAuth2 API」を有効化</li>
                  <li>OAuth2クライアントID（Webアプリケーション）を作成</li>
                  <li>承認済みリダイレクトURIに <code className="bg-[var(--md-sys-color-surface-container-high)] px-1 rounded-[var(--md-sys-shape-extra-small)] text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}/api/admin/google-callback</code> を追加</li>
                  <li><code className="bg-[var(--md-sys-color-surface-container-high)] px-1 rounded-[var(--md-sys-shape-extra-small)] text-xs">.env</code> に <code className="bg-[var(--md-sys-color-surface-container-high)] px-1 rounded-[var(--md-sys-shape-extra-small)] text-xs">GOOGLE_CLIENT_ID</code> と <code className="bg-[var(--md-sys-color-surface-container-high)] px-1 rounded-[var(--md-sys-shape-extra-small)] text-xs">GOOGLE_CLIENT_SECRET</code> を設定</li>
                </ol>
              </MessageBanner>
              <a
                href="/api/admin/google-auth"
                className="inline-flex items-center gap-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] px-5 py-2.5 rounded-[var(--md-sys-shape-full)] text-sm font-medium hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors shadow-[var(--md-sys-elevation-1)]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Googleアカウントを連携する
              </a>
            </div>
          )}
        </Card>

        {/* ─── スプレッドシート設定 ─── */}
        <Card variant="elevated" padding="md">
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">ライセンスキー スプレッドシート設定</h3>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5">インポート元のGoogleスプレッドシートを指定します。</p>

          <form onSubmit={handleSaveSheetConfig} className="space-y-5 max-w-lg">
            <TextField
              label="スプレッドシートURL または ID"
              value={sheetForm.spreadsheetUrl}
              onChange={(v) => setSheetForm({ ...sheetForm, spreadsheetUrl: v })}
              placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit"
              helper="URLからIDを自動抽出します"
            />

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="シート名（タブ）"
                value={sheetForm.sheetName}
                onChange={(v) => setSheetForm({ ...sheetForm, sheetName: v })}
                placeholder="ライセンスキー"
              />
              <div>
                <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  キーの列
                </label>
                <select
                  value={sheetForm.keyColumn}
                  onChange={e => setSheetForm({ ...sheetForm, keyColumn: e.target.value })}
                  className="
                    w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)]
                    border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)]
                    text-[var(--md-sys-color-on-surface)]
                    focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2
                  "
                >
                  {['A','B','C','D','E','F','G','H'].map(col => (
                    <option key={col} value={col}>列 {col}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 px-3.5">1行目はヘッダーとしてスキップ</p>
              </div>
            </div>

            {/* 現在の設定プレビュー */}
            {config?.spreadsheetId && (
              <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono break-all">
                ID: {config.spreadsheetId}
              </div>
            )}

            <Button
              variant="filled"
              type="submit"
              loading={saving}
              disabled={!sheetForm.spreadsheetUrl.trim()}
            >
              設定を保存
            </Button>
          </form>
        </Card>

        {/* ─── メール通知設定 ─── */}
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
            {/* 通知の有効/無効 */}
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

            {/* SMTP設定 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <TextField
                  label="SMTPホスト"
                  value={emailForm.smtpHost}
                  onChange={(v) => setEmailForm({ ...emailForm, smtpHost: v })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  ポート
                </label>
                <select
                  value={emailForm.smtpPort}
                  onChange={e => setEmailForm({ ...emailForm, smtpPort: e.target.value })}
                  className="
                    w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)]
                    border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)]
                    text-[var(--md-sys-color-on-surface)]
                    focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2
                  "
                >
                  <option value="587">587 (TLS)</option>
                  <option value="465">465 (SSL)</option>
                  <option value="25">25</option>
                </select>
              </div>
            </div>

            <TextField
              label="SMTPユーザー名（メールアドレス）"
              value={emailForm.smtpUser}
              onChange={(v) => setEmailForm({ ...emailForm, smtpUser: v })}
              type="email"
              placeholder="noreply@kaikuru.jp"
            />

            <TextField
              label={emailConfig.hasPassword ? 'SMTPパスワード（設定済み）' : 'SMTPパスワード'}
              value={emailForm.smtpPass}
              onChange={(v) => setEmailForm({ ...emailForm, smtpPass: v })}
              type="password"
              placeholder={emailConfig.hasPassword ? '変更しない場合は空白のまま' : 'パスワードを入力...'}
              helper={emailConfig.hasPassword ? '変更する場合のみ入力してください' : undefined}
            />

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="送信元メールアドレス"
                value={emailForm.fromAddress}
                onChange={(v) => setEmailForm({ ...emailForm, fromAddress: v })}
                type="email"
                placeholder="noreply@kaikuru.jp"
                helper="空白の場合はSMTPユーザー名を使用"
              />
              <TextField
                label="送信元表示名"
                value={emailForm.fromName}
                onChange={(v) => setEmailForm({ ...emailForm, fromName: v })}
                placeholder="買いクル 本部"
              />
            </div>

            <Button
              variant="filled"
              type="submit"
              loading={emailSaving}
            >
              設定を保存
            </Button>
          </form>

          {/* テスト送信 */}
          <div className="mt-6 pt-6 border-t border-[var(--md-sys-color-outline-variant)] ml-8">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3">テスト送信</h4>
            <div className="flex gap-3 max-w-lg items-end">
              <div className="flex-1">
                <TextField
                  label="送信先メールアドレス"
                  value={testEmail}
                  onChange={setTestEmail}
                  type="email"
                  placeholder="test@example.com"
                />
              </div>
              <Button
                variant="tonal"
                loading={testSending}
                disabled={!testEmail}
                onClick={handleSendTestEmail}
                className="flex-shrink-0"
              >
                テスト送信
              </Button>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">設定を保存後、指定したアドレスにテストメールを送信します</p>
          </div>
        </Card>

        {/* ─── 同期ログ ─── */}
        <SyncLogSection />

        {/* ─── テストデータ管理 ─── */}
        <TestDataManagement />
      </div>
    </>
  )
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={<LoadingSpinner size="lg" fullPage label="読み込み中..." />}
    >
      <AdminSettingsContent />
    </Suspense>
  )
}

function TestDataManagement() {
  const [stats, setStats] = useState<{ userCount: number; visitCount: number; licenseKeyCount: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/test-data')
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleDelete() {
    if (!confirm('テストデータ（ユーザー・訪問記録・ライセンスキー）をすべて削除しますか？\nこの操作は取り消せません。')) return
    setDeleting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/test-data', { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `テストデータを削除しました（ユーザー: ${data.deletedUsers}件, 訪問: ${data.deletedVisits}件, ライセンスキー: ${data.deletedLicenseKeys}件）` })
        setStats({ userCount: 0, visitCount: 0, licenseKeyCount: 0 })
      } else {
        setMessage({ type: 'error', text: 'テストデータの削除に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: 'テストデータの削除に失敗しました' })
    }
    setDeleting(false)
  }

  async function handleSeed() {
    if (!confirm('テストデータ（100顧客 + 各10訪問 = 1000件）を投入しますか？\n処理に数分かかる場合があります。')) return
    setSeeding(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/test-data', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `テストデータを投入しました（顧客: ${data.createdUsers}件, 訪問: ${data.createdVisits}件, ライセンスキー: ${data.createdLicenseKeys}件）` })
        setStats({ userCount: data.createdUsers, visitCount: data.createdVisits, licenseKeyCount: data.createdLicenseKeys })
      } else {
        setMessage({ type: 'error', text: data.error || 'テストデータの投入に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: 'テストデータの投入に失敗しました' })
    }
    setSeeding(false)
  }

  if (loading) return null

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">テストデータ管理</h3>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4 ml-8">
        テストデータの投入・確認・一括削除ができます。
      </p>

      {message && <MessageBanner severity={message.type} className="mb-4">{message.text}</MessageBanner>}

      <div className="ml-8 space-y-4">
        {stats && stats.userCount > 0 ? (
          <>
            <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-medium)] p-4 border border-[var(--md-sys-color-outline-variant)]">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">{stats.userCount}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">テスト顧客</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">{stats.visitCount}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">訪問記録</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">{stats.licenseKeyCount}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">ライセンスキー</p>
                </div>
              </div>
            </div>
            <Button variant="filled" danger loading={deleting} onClick={handleDelete}>
              テストデータを一括削除
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--md-sys-color-outline)]">テストデータはありません</p>
            <Button variant="filled" loading={seeding} onClick={handleSeed}>
              {seeding ? 'テストデータ投入中...' : 'テストデータを投入（100顧客 + 1000訪問）'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function SyncLogSection() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/sync-log')
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return null
  if (logs.length === 0) return null

  return (
    <Card variant="elevated" padding="md">
      <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-4">同期ログ（直近10件）</h3>
      <div className="space-y-2">
        {logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0">
            <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              log.status === 'success'
                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
                : 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-[var(--status-completed-text)]' : 'bg-[var(--md-sys-color-error)]'}`} />
              {log.status === 'success' ? '成功' : 'エラー'}
            </span>
            <span className="flex-shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full">
              {log.type}
            </span>
            <span className="text-[var(--md-sys-color-on-surface-variant)] flex-1 text-xs">{log.message}</span>
            <span className="text-xs text-[var(--md-sys-color-outline)] flex-shrink-0">
              {format(new Date(log.syncedAt), 'M/d HH:mm', { locale: ja })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
