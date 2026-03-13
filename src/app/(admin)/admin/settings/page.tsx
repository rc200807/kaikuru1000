'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const isConnected = config?.isConnected ?? false
  const hasCredentials = true // 実行時にチェック（常にtrue扱い、エラーは連携ボタン押下時に発生）

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <header className="bg-gray-800 text-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/admin/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {(session?.user as any)?.avatar ? (
              <img src={(session?.user as any)?.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-gray-600" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-600 border-2 border-gray-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{(session?.user as any)?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div>
              <p className="text-gray-400 text-xs font-medium tracking-widest uppercase">買いクル 管理ポータル</p>
              <h1 className="text-base font-semibold mt-0.5">{(session?.user as any)?.name}</h1>
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/admin/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">ダッシュボード</Link>
            <Link href="/admin/customers" className="text-sm text-gray-300 hover:text-white transition-colors">顧客管理</Link>
            <Link href="/admin/stores" className="text-sm text-gray-300 hover:text-white transition-colors">店舗管理</Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">メンバー</Link>
            <Link href="/admin/settings" className="text-sm font-medium text-white border-b border-white pb-0.5">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">システム設定</h2>

        {/* メッセージ */}
        {message && (
          <div className={`px-4 py-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* ─── Google アカウント連携 ─── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-1">
            {/* Google icon */}
            <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <h3 className="text-base font-semibold text-gray-900">Googleアカウント連携</h3>
            {isConnected && (
              <span className="ml-auto text-xs font-medium bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                連携済み
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-5 ml-9">
            ライセンスキーをGoogleスプレッドシートからインポートするために使用します。
          </p>

          {isConnected ? (
            <div className="ml-9 space-y-4">
              {/* 連携中アカウント情報 */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{config?.googleEmail}</p>
                    {config?.tokenExpiry && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        トークン有効期限: {format(new Date(config.tokenExpiry), 'yyyy/M/d HH:mm', { locale: ja })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <a
                  href="/api/admin/google-auth"
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  別のアカウントで再連携
                </a>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? '解除中...' : '連携を解除'}
                </button>
              </div>
            </div>
          ) : (
            <div className="ml-9 space-y-4">
              {/* 未連携の説明 */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800 space-y-2">
                <p className="font-medium">事前準備が必要です</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-700">
                  <li>Google Cloud Console でプロジェクトを作成</li>
                  <li>「Google Sheets API」と「Google OAuth2 API」を有効化</li>
                  <li>OAuth2クライアントID（Webアプリケーション）を作成</li>
                  <li>承認済みリダイレクトURIに <code className="bg-amber-100 px-1 rounded text-xs">{typeof window !== 'undefined' ? window.location.origin : ''}/api/admin/google-callback</code> を追加</li>
                  <li><code className="bg-amber-100 px-1 rounded text-xs">.env</code> に <code className="bg-amber-100 px-1 rounded text-xs">GOOGLE_CLIENT_ID</code> と <code className="bg-amber-100 px-1 rounded text-xs">GOOGLE_CLIENT_SECRET</code> を設定</li>
                </ol>
              </div>
              <a
                href="/api/admin/google-auth"
                className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
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
        </div>

        {/* ─── スプレッドシート設定 ─── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">ライセンスキー スプレッドシート設定</h3>
          <p className="text-sm text-gray-500 mb-5">インポート元のGoogleスプレッドシートを指定します。</p>

          <form onSubmit={handleSaveSheetConfig} className="space-y-5 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                スプレッドシートURL または ID
              </label>
              <input
                type="text"
                value={sheetForm.spreadsheetUrl}
                onChange={e => setSheetForm({ ...sheetForm, spreadsheetUrl: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit  または  スプレッドシートID"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              <p className="text-xs text-gray-400 mt-1">URLからIDを自動抽出します</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">シート名（タブ）</label>
                <input
                  type="text"
                  value={sheetForm.sheetName}
                  onChange={e => setSheetForm({ ...sheetForm, sheetName: e.target.value })}
                  placeholder="ライセンスキー"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">キーの列</label>
                <select
                  value={sheetForm.keyColumn}
                  onChange={e => setSheetForm({ ...sheetForm, keyColumn: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 bg-white"
                >
                  {['A','B','C','D','E','F','G','H'].map(col => (
                    <option key={col} value={col}>列 {col}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">1行目はヘッダーとしてスキップ</p>
              </div>
            </div>

            {/* 現在の設定プレビュー */}
            {config?.spreadsheetId && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs text-gray-500 font-mono break-all">
                ID: {config.spreadsheetId}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !sheetForm.spreadsheetUrl.trim()}
              className="bg-gray-800 text-white px-8 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </form>
        </div>

        {/* ─── メール通知設定 ─── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-1">
            <svg className="w-5 h-5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-base font-semibold text-gray-900">メール通知設定</h3>
            <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${
              emailConfig.enabled
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}>
              {emailConfig.enabled ? '通知ON' : '通知OFF'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-5 ml-8">
            顧客が店舗に割り当てられたとき、担当店舗にメールで通知します。SMTPサーバーの設定が必要です。
          </p>

          <form onSubmit={handleSaveEmailConfig} className="space-y-5 max-w-lg ml-8">
            {/* 通知の有効/無効 */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setEmailForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative w-10 h-6 rounded-full transition-colors ${emailForm.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${emailForm.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {emailForm.enabled ? '割り当て時にメールを送信する' : 'メール通知は無効'}
              </span>
            </label>

            {/* SMTP設定 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTPホスト</label>
                <input
                  type="text"
                  value={emailForm.smtpHost}
                  onChange={e => setEmailForm({ ...emailForm, smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ポート</label>
                <select
                  value={emailForm.smtpPort}
                  onChange={e => setEmailForm({ ...emailForm, smtpPort: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 bg-white"
                >
                  <option value="587">587 (TLS)</option>
                  <option value="465">465 (SSL)</option>
                  <option value="25">25</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTPユーザー名（メールアドレス）</label>
              <input
                type="email"
                value={emailForm.smtpUser}
                onChange={e => setEmailForm({ ...emailForm, smtpUser: e.target.value })}
                placeholder="noreply@kaikuru.jp"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                SMTPパスワード
                {emailConfig.hasPassword && (
                  <span className="ml-2 text-xs font-normal text-gray-400">（設定済み・変更する場合のみ入力）</span>
                )}
              </label>
              <input
                type="password"
                value={emailForm.smtpPass}
                onChange={e => setEmailForm({ ...emailForm, smtpPass: e.target.value })}
                placeholder={emailConfig.hasPassword ? '変更しない場合は空白のまま' : 'パスワードを入力...'}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">送信元メールアドレス</label>
                <input
                  type="email"
                  value={emailForm.fromAddress}
                  onChange={e => setEmailForm({ ...emailForm, fromAddress: e.target.value })}
                  placeholder="noreply@kaikuru.jp"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
                <p className="text-xs text-gray-400 mt-1">空白の場合はSMTPユーザー名を使用</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">送信元表示名</label>
                <input
                  type="text"
                  value={emailForm.fromName}
                  onChange={e => setEmailForm({ ...emailForm, fromName: e.target.value })}
                  placeholder="買いクル 本部"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={emailSaving}
              className="bg-gray-800 text-white px-8 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              {emailSaving ? '保存中...' : '設定を保存'}
            </button>
          </form>

          {/* テスト送信 */}
          <div className="mt-6 pt-6 border-t border-gray-100 ml-8">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">テスト送信</h4>
            <div className="flex gap-3 max-w-lg">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              <button
                onClick={handleSendTestEmail}
                disabled={testSending || !testEmail}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {testSending ? '送信中...' : 'テスト送信'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">設定を保存後、指定したアドレスにテストメールを送信します</p>
          </div>
        </div>

        {/* ─── 同期ログ ─── */}
        <SyncLogSection />
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
          <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <AdminSettingsContent />
    </Suspense>
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">同期ログ（直近10件）</h3>
      <div className="space-y-2">
        {logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-50 last:border-0">
            <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
              log.status === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}>
              {log.status === 'success' ? '成功' : 'エラー'}
            </span>
            <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
              {log.type}
            </span>
            <span className="text-gray-600 flex-1 text-xs">{log.message}</span>
            <span className="text-xs text-gray-300 flex-shrink-0">
              {format(new Date(log.syncedAt), 'M/d HH:mm', { locale: ja })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
