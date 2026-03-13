'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type LicenseKey = {
  id: string
  key: string
  isUsed: boolean
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

type GoogleConfig = {
  isConnected: boolean
  googleEmail: string | null
  spreadsheetId: string | null
  sheetName: string
} | null

export default function AdminLicensesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [keys, setKeys] = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newKeys, setNewKeys] = useState('')
  const [adding, setAdding] = useState(false)
  const [filterUsed, setFilterUsed] = useState<'' | 'used' | 'unused'>('')
  const [search, setSearch] = useState('')

  // Googleインポート
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>(null)
  const [importing, setImporting] = useState(false)

  // CSVインポート
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const [csvImporting, setCsvImporting] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') { router.push('/'); return }
      fetchKeys()
      fetchGoogleConfig()
    }
  }, [status, session])

  function fetchKeys() {
    fetch('/api/license-keys').then(r => r.json()).then(data => {
      setKeys(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }

  function fetchGoogleConfig() {
    fetch('/api/admin/google-config')
      .then(r => r.json())
      .then(data => setGoogleConfig(data))
      .catch(() => {})
  }

  async function handleAddKeys(e: React.FormEvent) {
    e.preventDefault()
    const keyList = newKeys.split('\n').map(k => k.trim()).filter(k => k)
    if (keyList.length === 0) return

    setAdding(true)
    setMessage(null)
    const res = await fetch('/api/license-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: keyList }),
    })
    const data = await res.json()
    setAdding(false)

    if (data.created?.length > 0) {
      setMessage({ type: 'success', text: `${data.created.length}件のライセンスキーを追加しました${data.errors?.length > 0 ? `（${data.errors.length}件はエラー）` : ''}` })
      setNewKeys('')
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: '追加に失敗しました（重複または無効なキーの可能性があります）' })
    }
  }

  async function handleImportFromSheets() {
    setImporting(true)
    setMessage(null)
    const res = await fetch('/api/admin/sync-licenses', { method: 'POST' })
    const data = await res.json()
    setImporting(false)

    if (res.ok && data.success) {
      setMessage({
        type: 'success',
        text: `インポート完了: ${data.created}件追加（${data.skipped}件は重複スキップ）`,
      })
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: data.error || 'インポートに失敗しました' })
    }
  }

  function handleExportCSV() {
    window.location.href = '/api/license-keys/export'
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvImporting(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/license-keys/import', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    setCsvImporting(false)

    // ファイル入力をリセット
    if (csvFileInputRef.current) csvFileInputRef.current.value = ''

    if (res.ok && data.success) {
      setMessage({
        type: 'success',
        text: `CSVインポート完了: ${data.created}件追加（${data.skipped}件は重複スキップ）`,
      })
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: data.error || 'CSVインポートに失敗しました' })
    }
  }

  function generateKey() {
    const year = new Date().getFullYear()
    const part1 = Math.random().toString(36).slice(2, 6).toUpperCase()
    const part2 = Math.floor(Math.random() * 9000 + 1000)
    return `KK-${year}-${part1}-${part2}`
  }

  function handleGenerateKeys(count: number) {
    const generated = Array.from({ length: count }, generateKey)
    setNewKeys(prev => prev ? prev + '\n' + generated.join('\n') : generated.join('\n'))
  }

  const filtered = keys.filter(k => {
    const matchSearch = !search || k.key.includes(search) || k.user?.name?.includes(search)
    const matchUsed = !filterUsed || (filterUsed === 'used' ? k.isUsed : !k.isUsed)
    return matchSearch && matchUsed
  })

  const unusedCount = keys.filter(k => !k.isUsed).length
  const usedCount = keys.filter(k => k.isUsed).length

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

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
            <Link href="/admin/licenses" className="text-sm font-medium text-white border-b border-white pb-0.5">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">メンバー</Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左: キー追加フォーム */}
          <div className="lg:col-span-1 space-y-4">

            {/* ── Googleスプレッドシートからインポート ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <h3 className="text-sm font-semibold text-gray-900">スプレッドシートからインポート</h3>
              </div>

              {googleConfig?.isConnected && googleConfig?.spreadsheetId ? (
                <div className="space-y-3">
                  {/* 連携状態表示 */}
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium text-gray-700">{googleConfig.googleEmail}</span>
                    </div>
                    <p className="pl-3.5 truncate text-gray-400">シート: {googleConfig.sheetName}</p>
                  </div>
                  <button
                    onClick={handleImportFromSheets}
                    disabled={importing}
                    className="w-full bg-green-600 text-white py-2.5 rounded-full text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {importing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        インポート中...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        インポート実行
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-400 mb-2">
                    {!googleConfig?.isConnected
                      ? 'Googleアカウントが未連携です'
                      : 'スプレッドシートが未設定です'}
                  </p>
                  <Link
                    href="/admin/settings"
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    設定ページで設定する →
                  </Link>
                </div>
              )}
            </div>

            {/* ── CSVインポート・エクスポート ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">CSV インポート / エクスポート</h3>
              <div className="space-y-2">
                {/* エクスポートボタン */}
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSVエクスポート
                </button>

                {/* インポートボタン（hidden input trigger） */}
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportCSV}
                />
                <button
                  onClick={() => csvFileInputRef.current?.click()}
                  disabled={csvImporting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {csvImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      インポート中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      CSVインポート
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  1列目にライセンスキーを記載したCSV
                </p>
              </div>
            </div>

            {/* ── 手動追加フォーム ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">手動追加</h3>

              {/* 統計 */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{unusedCount}</div>
                  <div className="text-xs text-green-600 mt-0.5">未使用</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="text-2xl font-bold text-gray-600">{usedCount}</div>
                  <div className="text-xs text-gray-400 mt-0.5">使用済み</div>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                {[5, 10, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => handleGenerateKeys(n)}
                    className="flex-1 text-xs bg-gray-100 text-gray-700 py-1.5 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    {n}件生成
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddKeys}>
                <textarea
                  value={newKeys}
                  onChange={e => setNewKeys(e.target.value)}
                  placeholder={"1行に1つのキーを入力\nKK-2024-XXXX-0000\nKK-2024-YYYY-1111"}
                  rows={6}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-700 resize-none mb-3"
                />
                <button
                  type="submit" disabled={adding || !newKeys.trim()}
                  className="w-full bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
                >
                  {adding ? '追加中...' : 'キーを追加'}
                </button>
              </form>

              {message && (
                <div className={`mt-4 px-3 py-2.5 rounded-xl text-sm ${
                  message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {message.text}
                </div>
              )}
            </div>
          </div>

          {/* 右: キー一覧 */}
          <div className="lg:col-span-2">
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <h2 className="text-xl font-semibold text-gray-900 flex-none">ライセンスキー一覧</h2>
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="キー・氏名で検索..."
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 w-48 bg-white"
              />
              <select
                value={filterUsed}
                onChange={e => setFilterUsed(e.target.value as any)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 bg-white"
              >
                <option value="">すべて</option>
                <option value="unused">未使用のみ</option>
                <option value="used">使用済みのみ</option>
              </select>
              <span className="ml-auto text-sm text-gray-400">{filtered.length}件</span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">ライセンスキー</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">状態</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">使用者</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">発行日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(key => (
                    <tr key={key.id} className={`hover:bg-gray-50 transition-colors ${key.isUsed ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-3">
                        <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded-md select-all">
                          {key.key}
                        </code>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          key.isUsed ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'
                        }`}>
                          {key.isUsed ? '使用済み' : '未使用'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {key.user ? key.user.name : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-400">
                        {format(new Date(key.createdAt), 'yyyy/M/d', { locale: ja })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-12 text-center text-sm text-gray-400">該当するキーがありません</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
