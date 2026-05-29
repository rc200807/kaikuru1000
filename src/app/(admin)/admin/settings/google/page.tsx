'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type GoogleConfig = {
  id: string
  googleEmail: string | null
  isConnected: boolean
  spreadsheetId: string | null
  sheetName: string
  keyColumn: string
  tokenExpiry: string | null
  inquirySpreadsheetId?: string | null
  inquirySheetName?: string
} | null

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input
}

export default function GoogleSettingsPage() {
  return (
    <SettingsShell title="Google連携・スプレッドシート">
      <Suspense fallback={null}>
        <GoogleSettingsContent />
      </Suspense>
      <SyncLogSection />
    </SettingsShell>
  )
}

function GoogleSettingsContent() {
  const searchParams = useSearchParams()
  const [config, setConfig] = useState<GoogleConfig>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sheetForm, setSheetForm] = useState({ spreadsheetUrl: '', sheetName: 'ライセンスキー', keyColumn: 'A' })
  const [inquirySheetForm, setInquirySheetForm] = useState({ spreadsheetUrl: '', sheetName: 'お問い合わせ' })
  const [inquirySaving, setInquirySaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

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
          setInquirySheetForm({
            spreadsheetUrl: data.inquirySpreadsheetId || '',
            sheetName: data.inquirySheetName || 'お問い合わせ',
          })
        }
      })
      .catch(() => {})
  }

  useEffect(() => { fetchConfig() }, [])

  async function handleSaveSheetConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const spreadsheetId = extractSpreadsheetId(sheetForm.spreadsheetUrl)
    const res = await fetch('/api/admin/google-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId, sheetName: sheetForm.sheetName, keyColumn: sheetForm.keyColumn.toUpperCase() }),
    })
    setSaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'スプレッドシート設定を保存しました' })
      fetchConfig()
    } else {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
  }

  async function handleSaveInquirySheetConfig(e: React.FormEvent) {
    e.preventDefault()
    setInquirySaving(true)
    setMessage(null)
    const spreadsheetId = extractSpreadsheetId(inquirySheetForm.spreadsheetUrl)
    const res = await fetch('/api/admin/google-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquirySpreadsheetId: spreadsheetId || null, inquirySheetName: inquirySheetForm.sheetName || 'お問い合わせ' }),
    })
    setInquirySaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'お問い合わせスプレッドシート設定を保存しました' })
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

  const isConnected = config?.isConnected ?? false

  return (
    <>
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      {/* Google アカウント連携 */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
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
              <a href="/api/admin/google-auth" className="text-sm text-[var(--portal-primary,#374151)] hover:opacity-70 underline transition-opacity">
                別のアカウントで再連携
              </a>
              <span className="text-[var(--md-sys-color-outline)]">|</span>
              <Button variant="text" size="sm" danger loading={disconnecting} onClick={handleDisconnect}>連携を解除</Button>
            </div>
          </div>
        ) : (
          <div className="ml-9 space-y-4">
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
            <a href="/api/admin/google-auth" className="inline-flex items-center gap-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] px-5 py-2.5 rounded-[var(--md-sys-shape-full)] text-sm font-medium hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors shadow-[var(--md-sys-elevation-1)]">
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

      {/* ライセンスキー スプレッドシート設定 */}
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
            <TextField label="シート名（タブ）" value={sheetForm.sheetName} onChange={(v) => setSheetForm({ ...sheetForm, sheetName: v })} placeholder="ライセンスキー" />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">キーの列</label>
              <select
                value={sheetForm.keyColumn}
                onChange={e => setSheetForm({ ...sheetForm, keyColumn: e.target.value })}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                {['A','B','C','D','E','F','G','H'].map(col => (
                  <option key={col} value={col}>列 {col}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 px-3.5">1行目はヘッダーとしてスキップ</p>
            </div>
          </div>
          {config?.spreadsheetId && (
            <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono break-all">
              ID: {config.spreadsheetId}
            </div>
          )}
          <Button variant="filled" type="submit" loading={saving} disabled={!sheetForm.spreadsheetUrl.trim()}>設定を保存</Button>
        </form>
      </Card>

      {/* お問い合わせ スプレッドシート設定 */}
      <Card variant="elevated" padding="md">
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">お問い合わせ スプレッドシート設定</h3>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5">
          お問い合わせデータを自動・手動で記録するGoogleスプレッドシートを指定します。サービスアカウントに編集権限を共有してください。
        </p>

        <form onSubmit={handleSaveInquirySheetConfig} className="space-y-5 max-w-lg">
          <TextField
            label="スプレッドシートURL または ID"
            value={inquirySheetForm.spreadsheetUrl}
            onChange={(v) => setInquirySheetForm({ ...inquirySheetForm, spreadsheetUrl: v })}
            placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit"
            helper="URLからIDを自動抽出します。未設定の場合、自動記録・エクスポートは無効になります。"
          />
          <TextField label="シート名（タブ）" value={inquirySheetForm.sheetName} onChange={(v) => setInquirySheetForm({ ...inquirySheetForm, sheetName: v })} placeholder="お問い合わせ" />
          {config?.inquirySpreadsheetId && (
            <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono break-all">
              ID: {config.inquirySpreadsheetId}
            </div>
          )}
          <Button variant="filled" type="submit" loading={inquirySaving}>設定を保存</Button>
        </form>
      </Card>
    </>
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
