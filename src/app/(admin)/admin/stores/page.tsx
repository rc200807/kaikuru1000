'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Store = {
  id: string
  name: string
  code: string
  prefecture: string | null
  address: string | null
  phone: string | null
  email: string | null
  _count: { customers: number }
}

type SyncLog = {
  id: string
  status: string
  message: string | null
  syncedAt: string
}

export default function AdminStoresPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stores, setStores] = useState<Store[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 新規店舗追加モーダル
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    code: '', name: '', email: '', phone: '', prefecture: '', address: '',
  })
  const [creating, setCreating] = useState(false)

  // パスワード表示モーダル
  const [passwordModal, setPasswordModal] = useState<{ storeName: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // パスワード再発行中の店舗ID
  const [resettingId, setResettingId] = useState<string | null>(null)

  // スプレッドシートURL設定
  const [storeSheetUrl, setStoreSheetUrl] = useState('')
  const [storeSheetName, setStoreSheetName] = useState('店舗マスター')
  const [savingSheet, setSavingSheet] = useState(false)
  const [sheetSaved, setSheetSaved] = useState(false)

  // カラムマッピング
  type ColMap = { code: string; name: string; prefecture: string; address: string; phone: string; email: string }
  const defaultColMap: ColMap = { code: 'A', name: 'B', prefecture: 'C', address: 'D', phone: 'E', email: 'F' }
  const [colMap, setColMap] = useState<ColMap>(defaultColMap)
  const [sheetHeaders, setSheetHeaders] = useState<{ letter: string; header: string }[]>([])
  const [fetchingHeaders, setFetchingHeaders] = useState(false)
  const [headerError, setHeaderError] = useState('')

  // スプレッドシート設定セクションの開閉
  const [sheetSectionOpen, setSheetSectionOpen] = useState(false)

  // 検索
  const [searchQ, setSearchQ] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') { router.push('/'); return }

      Promise.all([
        fetch('/api/stores').then(r => r.json()),
        fetch('/api/sync-stores').then(r => r.json()),
        fetch('/api/admin/google-config').then(r => r.json()),
      ]).then(([storesData, logsData, sheetConfig]) => {
        setStores(Array.isArray(storesData) ? storesData : [])
        setSyncLogs(Array.isArray(logsData) ? logsData : [])
        if (sheetConfig?.storeSpreadsheetId) setStoreSheetUrl(sheetConfig.storeSpreadsheetId)
        if (sheetConfig?.storeSheetName) setStoreSheetName(sheetConfig.storeSheetName)
        if (sheetConfig?.storeColumnMapping) setColMap({ ...defaultColMap, ...sheetConfig.storeColumnMapping })
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  function refreshStores() {
    fetch('/api/stores').then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : []))
  }

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    const res = await fetch('/api/sync-stores', { method: 'POST' })
    const data = await res.json()
    setSyncing(false)
    if (data.success) {
      setMessage({ type: 'success', text: `${data.message}` })
      refreshStores()
      fetch('/api/sync-stores').then(r => r.json()).then(d => setSyncLogs(Array.isArray(d) ? d : []))
    } else {
      setMessage({ type: 'error', text: `同期に失敗しました: ${data.message}` })
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const res = await fetch('/api/admin/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code:       createForm.code.trim(),
        name:       createForm.name.trim(),
        email:      createForm.email.trim() || undefined,
        phone:      createForm.phone.trim() || undefined,
        prefecture: createForm.prefecture.trim() || undefined,
        address:    createForm.address.trim() || undefined,
      }),
    })
    const data = await res.json()
    setCreating(false)

    if (res.ok) {
      setShowCreateModal(false)
      setCreateForm({ code: '', name: '', email: '', phone: '', prefecture: '', address: '' })
      setPasswordModal({ storeName: createForm.name.trim(), password: data.password })
      refreshStores()
    } else {
      setMessage({ type: 'error', text: data.error || '店舗の作成に失敗しました' })
      setShowCreateModal(false)
    }
  }

  async function handleResetPassword(store: Store) {
    if (!confirm(`「${store.name}」のパスワードを再発行しますか？\n現在のパスワードは無効になります。`)) return
    setResettingId(store.id)
    const res = await fetch(`/api/admin/stores/${store.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    })
    const data = await res.json()
    setResettingId(null)

    if (res.ok) {
      setPasswordModal({ storeName: store.name, password: data.password })
    } else {
      setMessage({ type: 'error', text: data.error || 'パスワードの再発行に失敗しました' })
    }
  }

  async function handleFetchHeaders() {
    if (!storeSheetUrl.trim()) return
    setFetchingHeaders(true)
    setHeaderError('')
    setSheetHeaders([])
    const params = new URLSearchParams({
      spreadsheetId: storeSheetUrl.trim(),
      sheetName: storeSheetName.trim() || '店舗マスター',
    })
    const res = await fetch(`/api/admin/stores/sheet-headers?${params}`)
    const data = await res.json()
    setFetchingHeaders(false)
    if (!res.ok) {
      setHeaderError(data.error || '列の取得に失敗しました')
    } else {
      setSheetHeaders(data.columns)
    }
  }

  async function handleSaveSheetUrl() {
    setSavingSheet(true)
    await fetch('/api/admin/google-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeSpreadsheetId: storeSheetUrl.trim(),
        storeSheetName: storeSheetName.trim() || '店舗マスター',
        storeColumnMapping: colMap,
      }),
    })
    setSavingSheet(false)
    setSheetSaved(true)
    setTimeout(() => setSheetSaved(false), 3000)
  }

  function handleCopyPassword() {
    if (!passwordModal) return
    navigator.clipboard.writeText(passwordModal.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      {/* ─── ヘッダー ─── */}
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
            <Link href="/admin/stores" className="text-sm font-medium text-white border-b border-white pb-0.5">店舗管理</Link>
            <Link href="/admin/visits" className="text-sm text-gray-300 hover:text-white transition-colors">訪問記録</Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">メンバー</Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              店舗一覧
              <span className="ml-3 text-sm font-normal text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                {stores.length}店舗
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setMessage(null); setShowCreateModal(true) }}
              className="bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新規店舗追加
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-green-700 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? '同期中...' : 'スプレッドシートと同期'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Google Sheetsスプレッドシート設定 */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
          {/* アコーディオンヘッダー */}
          <button
            type="button"
            onClick={() => setSheetSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-800">同期するGoogleスプレッドシート</h3>
              {storeSheetUrl && !sheetSectionOpen && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">設定済み</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${sheetSectionOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* アコーディオンコンテンツ */}
          {sheetSectionOpen && (
          <div className="px-6 pb-5 border-t border-gray-100 pt-4">

          {/* URL・シート名 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto] mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">スプレッドシートURL または ID</label>
              <input
                type="text"
                value={storeSheetUrl}
                onChange={e => { setStoreSheetUrl(e.target.value); setSheetHeaders([]) }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">シート名（タブ名）</label>
              <input
                type="text"
                value={storeSheetName}
                onChange={e => { setStoreSheetName(e.target.value); setSheetHeaders([]) }}
                placeholder="SHOP"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleFetchHeaders}
                disabled={fetchingHeaders || !storeSheetUrl.trim()}
                className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 flex items-center gap-2 justify-center whitespace-nowrap"
              >
                {fetchingHeaders && (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                列を確認
              </button>
            </div>
          </div>

          {headerError && (
            <p className="text-xs text-red-500 mb-3">{headerError}</p>
          )}

          {/* カラムマッピング */}
          {sheetHeaders.length > 0 && (
            <div className="border border-gray-100 rounded-xl p-4 mb-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-600 mb-3">各項目に対応する列を選択してください</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  { key: 'code',        label: '店舗コード（必須）' },
                  { key: 'name',        label: '店舗名（必須）' },
                  { key: 'prefecture',  label: '都道府県' },
                  { key: 'address',     label: '住所' },
                  { key: 'phone',       label: '電話番号' },
                  { key: 'email',       label: 'メールアドレス' },
                ] as const).map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <select
                      value={colMap[key]}
                      onChange={e => setColMap(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
                    >
                      <option value="">未設定</option>
                      {sheetHeaders.map(col => (
                        <option key={col.letter} value={col.letter}>
                          {col.letter}列: {col.header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 保存ボタン */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSheetUrl}
              disabled={savingSheet || !storeSheetUrl.trim()}
              className="bg-gray-800 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {savingSheet ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : sheetSaved ? (
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
              {sheetSaved ? '保存しました' : '設定を保存'}
            </button>
            {sheetHeaders.length === 0 && storeSheetUrl && (
              <p className="text-xs text-gray-400">「列を確認」で列マッピングを設定できます</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            2行目以降がデータ行として読み込まれます（1行目はヘッダー）
          </p>
          </div>
          )}
        </div>

        {/* 検索バー */}
        <div className="mb-4">
          <div className="relative max-w-sm">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 0 5 11a6 6 0 0 0 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="店舗名・コード・都道府県・メールで検索"
              className="w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {(() => {
          const q = searchQ.trim().toLowerCase()
          const filtered = q
            ? stores.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.code.toLowerCase().includes(q) ||
                (s.prefecture || '').toLowerCase().includes(q) ||
                (s.email || '').toLowerCase().includes(q) ||
                (s.phone || '').includes(q) ||
                (s.address || '').toLowerCase().includes(q)
              )
            : stores

          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">店舗コード</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">店舗名</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">都道府県</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">電話番号</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">メール</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">担当顧客数</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(store => (
                    <tr key={store.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded-md">{store.code}</code>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{store.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{store.prefecture || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{store.phone || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{store.email || '—'}</td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-gray-900">{store._count.customers}</span>
                        <span className="text-sm text-gray-400 ml-1">名</span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleResetPassword(store)}
                          disabled={resettingId === store.id}
                          className="text-xs text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {resettingId === store.id ? '処理中...' : 'PW再発行'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-12 text-center text-sm text-gray-400">
                  {searchQ ? `「${searchQ}」に一致する店舗がありません` : '店舗データがありません'}
                </div>
              )}
              {searchQ && filtered.length > 0 && filtered.length < stores.length && (
                <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                  {stores.length}店舗中 {filtered.length}件を表示
                </div>
              )}
            </div>
          )
        })()}

        {/* 同期ログ */}
        {syncLogs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">同期ログ</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">日時</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">状態</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">メッセージ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {syncLogs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {new Date(log.syncedAt).toLocaleString('ja-JP')}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          log.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {log.status === 'success' ? '成功' : 'エラー'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── 新規店舗追加モーダル ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">新規店舗追加</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      店舗コード <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.code}
                      onChange={e => setCreateForm({ ...createForm, code: e.target.value })}
                      required
                      placeholder="TOKYO01"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">都道府県</label>
                    <input
                      type="text"
                      value={createForm.prefecture}
                      onChange={e => setCreateForm({ ...createForm, prefecture: e.target.value })}
                      placeholder="東京都"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    店舗名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    required
                    placeholder="買いクル 東京店"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">メールアドレス</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="tokyo@kaikuru.jp"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">電話番号</label>
                  <input
                    type="tel"
                    value={createForm.phone}
                    onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="03-1234-5678"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">住所</label>
                  <input
                    type="text"
                    value={createForm.address}
                    onChange={e => setCreateForm({ ...createForm, address: e.target.value })}
                    placeholder="東京都渋谷区..."
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <p className="text-xs text-gray-400">
                  ※ 初期パスワードは自動生成されます。作成後に一度だけ表示されますので必ず控えてください。
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
                  >
                    {creating ? '作成中...' : '店舗を追加'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── パスワード表示モーダル ─── */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">パスワードを発行しました</h3>
                  <p className="text-sm text-gray-500">{passwordModal.storeName}</p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 mb-2">ログインパスワード</p>
                <div className="flex items-center gap-3">
                  <code className="text-xl font-bold text-gray-900 tracking-widest flex-1 break-all">
                    {passwordModal.password}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    className="text-gray-400 hover:text-gray-700 transition-colors p-1 flex-shrink-0"
                    title="コピー"
                  >
                    {copied ? (
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
                ⚠️ このパスワードは一度しか表示されません。必ず控えてから閉じてください。
              </div>

              <button
                onClick={() => { setPasswordModal(null); setCopied(false) }}
                className="w-full bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
