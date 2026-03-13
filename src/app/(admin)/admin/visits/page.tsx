'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type VisitRecord = {
  id: string
  visitDate: string
  status: string
  note: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  user: { id: string; name: string; furigana: string; email: string; phone: string; address: string }
  store: { id: string; name: string; code: string }
}

type Store = { id: string; name: string; code: string }

const STATUS_OPTIONS = [
  { value: '',            label: 'すべて' },
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    scheduled:   { label: '予定',       className: 'bg-blue-50 text-blue-700' },
    pending:     { label: '未対応',     className: 'bg-amber-50 text-amber-700' },
    completed:   { label: '対応完了',   className: 'bg-green-50 text-green-700' },
    rescheduled: { label: 'リスケ',     className: 'bg-indigo-50 text-indigo-700' },
    absent:      { label: '不在',       className: 'bg-red-50 text-red-700' },
    cancelled:   { label: 'キャンセル', className: 'bg-gray-100 text-gray-500' },
  }
  const s = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>{s.label}</span>
}

function fmt(n: number | null | undefined) {
  if (n == null) return <span className="text-gray-300">—</span>
  return <span>¥{n.toLocaleString()}</span>
}

export default function AdminVisitsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [records, setRecords] = useState<VisitRecord[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // 検索フィルター
  const [q, setQ] = useState('')
  const [storeId, setStoreId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // 入力中の値（確定前）
  const [inputQ, setInputQ] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  // 店舗一覧取得
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(data => {
        setStores(Array.isArray(data) ? data : [])
      }).catch(() => {})
    }
  }, [status])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)            params.set('q', q)
    if (storeId)      params.set('storeId', storeId)
    if (filterStatus) params.set('status', filterStatus)
    if (from)         params.set('from', from)
    if (to)           params.set('to', to)
    params.set('limit', '200')

    const res = await fetch(`/api/admin/visits?${params}`)
    if (res.ok) {
      const data = await res.json()
      setRecords(data.records || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }, [q, storeId, filterStatus, from, to])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchRecords()
    }
  }, [status, fetchRecords])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setQ(inputQ)
  }

  function clearFilters() {
    setInputQ('')
    setQ('')
    setStoreId('')
    setFilterStatus('')
    setFrom('')
    setTo('')
  }

  // 合計金額
  const totalPurchase = records.reduce((s, r) => s + (r.purchaseAmount ?? 0), 0)
  const totalBilling  = records.reduce((s, r) => s + (r.billingAmount ?? 0), 0)
  const completedCount = records.filter(r => r.status === 'completed').length

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-gray-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ナビゲーション */}
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
            <Link href="/admin/visits" className="text-sm font-medium text-white border-b border-white pb-0.5">訪問記録</Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">ライセンスキー</Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">メンバー</Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">設定</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">訪問記録</h2>
            <p className="text-sm text-gray-400 mt-0.5">全店舗の訪問履歴を検索・閲覧できます</p>
          </div>
        </div>

        {/* 検索・フィルターパネル */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* フリーワード */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">キーワード（顧客名・フリガナ・メール・電話）</label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputQ}
                    onChange={e => setInputQ(e.target.value)}
                    placeholder="例: 山田 / yamada@"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 pr-10"
                  />
                  {inputQ && (
                    <button type="button" onClick={() => { setInputQ(''); setQ('') }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* 店舗 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">店舗</label>
                <select
                  value={storeId}
                  onChange={e => setStoreId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
                >
                  <option value="">すべての店舗</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* ステータス */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">ステータス</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 日付範囲 */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">訪問日（開始）</label>
                <input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">訪問日（終了）</label>
                <input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                />
              </div>
              <div className="flex gap-2 pb-0.5">
                <button
                  type="submit"
                  className="bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors"
                >
                  検索
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="border border-gray-200 text-gray-500 px-4 py-2.5 rounded-full text-sm hover:bg-gray-50 transition-colors"
                >
                  クリア
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* サマリーカード */}
        {!loading && records.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">該当件数</p>
              <p className="text-2xl font-bold text-gray-900">{total.toLocaleString()} <span className="text-sm font-normal text-gray-400">件</span></p>
              {total > records.length && (
                <p className="text-xs text-amber-500 mt-1">表示中: {records.length}件</p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">買取金額合計（表示分）</p>
              <p className="text-2xl font-bold text-gray-900">¥{totalPurchase.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">対応完了 {completedCount}件</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">請求金額合計（表示分）</p>
              <p className="text-2xl font-bold text-gray-900">¥{totalBilling.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* テーブル */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-400 text-sm">該当する訪問記録がありません</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">訪問日</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">顧客名</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">メールアドレス</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">電話番号</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">担当店舗</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">ステータス</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">買取金額</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">請求金額</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map(record => (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {format(new Date(record.visitDate), 'yyyy/M/d（E）', { locale: ja })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{record.user.name}</p>
                        <p className="text-xs text-gray-400">{record.user.furigana}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{record.user.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{record.user.phone}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{record.store.name}</p>
                        <p className="text-xs text-gray-400">{record.store.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 whitespace-nowrap font-medium">
                        {fmt(record.purchaseAmount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 whitespace-nowrap font-medium">
                        {fmt(record.billingAmount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-48 truncate">
                        {record.note || <span className="text-gray-200">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > records.length && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
                {total.toLocaleString()}件中 {records.length}件を表示しています
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
