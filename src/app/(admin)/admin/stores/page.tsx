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
      ]).then(([storesData, logsData]) => {
        setStores(Array.isArray(storesData) ? storesData : [])
        setSyncLogs(Array.isArray(logsData) ? logsData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    const res = await fetch('/api/sync-stores', { method: 'POST' })
    const data = await res.json()
    setSyncing(false)
    if (data.success) {
      setMessage({ type: 'success', text: `${data.message}` })
      // 店舗一覧を再読み込み
      fetch('/api/stores').then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : []))
      fetch('/api/sync-stores').then(r => r.json()).then(d => setSyncLogs(Array.isArray(d) ? d : []))
    } else {
      setMessage({ type: 'error', text: `同期に失敗しました: ${data.message}` })
    }
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
            <Link href="/admin/customers" className="text-sm text-gray-300 hover:text-white transition-colors">顧客管理</Link>
            <Link href="/admin/stores" className="text-sm font-medium text-white border-b border-white pb-0.5">店舗管理</Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">メンバー</Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            店舗一覧
            <span className="ml-3 text-sm font-normal text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {stores.length}店舗
            </span>
          </h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-green-700 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'スプレッドシートと同期中...' : 'スプレッドシートと同期'}
          </button>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Google Sheets設定案内 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-4 h-4 text-blue-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7" />
            </svg>
            <h3 className="text-sm font-semibold text-blue-800">Googleスプレッドシート連携</h3>
          </div>
          <p className="text-sm text-blue-700">
            店舗マスターデータをGoogleスプレッドシートと同期します。
            環境変数に <code className="bg-blue-100 px-1 rounded text-xs">GOOGLE_SHEETS_CLIENT_EMAIL</code>、
            <code className="bg-blue-100 px-1 rounded text-xs">GOOGLE_SHEETS_PRIVATE_KEY</code>、
            <code className="bg-blue-100 px-1 rounded text-xs">GOOGLE_SHEETS_SPREADSHEET_ID</code> を設定してください。
          </p>
          <p className="text-xs text-blue-600 mt-1">
            スプレッドシートの形式: A列=店舗コード, B列=店舗名, C列=都道府県, D列=住所, E列=電話番号, F列=メールアドレス
          </p>
        </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stores.map(store => (
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
                </tr>
              ))}
            </tbody>
          </table>
          {stores.length === 0 && (
            <div className="p-12 text-center text-sm text-gray-400">店舗データがありません</div>
          )}
        </div>

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
    </div>
  )
}
