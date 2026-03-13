'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type User = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  createdAt: string
  licenseKey: { key: string }
  store: { id: string; name: string; code: string } | null
  visitSchedules: Array<{ visitDate: string; status: string }>
}

type Store = {
  id: string
  name: string
  code: string
  prefecture: string | null
}

type VisitSchedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
}

const STATUS_OPTIONS = [
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

type DetailTab = 'info' | 'add' | 'history'

export default function AdminCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 店舗割り当てモーダル
  const [assigning, setAssigning] = useState<{ userId: string; name: string } | null>(null)
  const [selectedStore, setSelectedStore] = useState('')

  // 顧客詳細モーダル
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [detailSchedules, setDetailSchedules] = useState<VisitSchedule[]>([])
  const [detailSchedulesLoading, setDetailSchedulesLoading] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ storeId: '', visitDate: '', note: '' })
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') {
        router.push('/')
        return
      }

      Promise.all([
        fetch('/api/admin/users').then(r => r.json()),
        fetch('/api/stores').then(r => r.json()),
      ]).then(([usersData, storesData]) => {
        setUsers(Array.isArray(usersData) ? usersData : [])
        setStores(Array.isArray(storesData) ? storesData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  // 顧客詳細モーダルを開いたときにスケジュール取得
  useEffect(() => {
    if (!detailUser) return
    setDetailTab('info')
    setScheduleMsg(null)
    setScheduleForm({ storeId: detailUser.store?.id || '', visitDate: '', note: '' })
    setDetailSchedulesLoading(true)
    setDetailSchedules([])
    fetch(`/api/visit-schedules?userId=${detailUser.id}`)
      .then(r => r.json())
      .then(data => {
        setDetailSchedules(Array.isArray(data) ? data : [])
        setDetailSchedulesLoading(false)
      })
      .catch(() => setDetailSchedulesLoading(false))
  }, [detailUser])

  async function handleAssign() {
    if (!assigning || !selectedStore) return
    setMessage(null)

    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: assigning.userId, storeId: selectedStore }),
    })

    if (res.ok) {
      const data = await res.json()
      setUsers(prev => prev.map(u =>
        u.id === assigning.userId
          ? { ...u, store: { id: selectedStore, name: data.storeName, code: '' } }
          : u
      ))
      setMessage({ type: 'success', text: `${assigning.name}を${data.storeName}に割り当てました` })
    } else {
      setMessage({ type: 'error', text: '割り当てに失敗しました' })
    }
    setAssigning(null)
    setSelectedStore('')
  }

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!detailUser || !scheduleForm.storeId || !scheduleForm.visitDate) return
    setScheduleSubmitting(true)
    setScheduleMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: detailUser.id,
        storeId: scheduleForm.storeId,
        visitDate: scheduleForm.visitDate,
        note: scheduleForm.note || undefined,
      }),
    })

    setScheduleSubmitting(false)

    if (res.ok) {
      const created = await res.json()
      setDetailSchedules(prev => [created, ...prev])
      // 顧客一覧の次回訪問日を更新
      setUsers(prev => prev.map(u =>
        u.id === detailUser.id
          ? { ...u, visitSchedules: [{ visitDate: created.visitDate, status: 'scheduled' }] }
          : u
      ))
      setScheduleMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setScheduleForm(prev => ({ ...prev, visitDate: '', note: '' }))
    } else {
      setScheduleMsg({ type: 'error', text: 'スケジュールの追加に失敗しました' })
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setDetailSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  function closeDetailModal() {
    setDetailUser(null)
    setDetailSchedules([])
    setScheduleMsg(null)
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.includes(search) || u.furigana.includes(search) || u.email.includes(search)
    const matchStore = !filterStore || (filterStore === 'unassigned' ? !u.store : u.store?.id === filterStore)
    return matchSearch && matchStore
  })

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const unassignedCount = users.filter(u => !u.store).length
  const sortedDetailSchedules = [...detailSchedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

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
            <Link href="/admin/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">
              ダッシュボード
            </Link>
            <Link href="/admin/customers" className="text-sm font-medium text-white border-b border-white pb-0.5">
              顧客管理
            </Link>
            <Link href="/admin/stores" className="text-sm text-gray-300 hover:text-white transition-colors">
              店舗管理
            </Link>
            <Link href="/admin/licenses" className="text-sm text-gray-300 hover:text-white transition-colors">
              ライセンスキー
            </Link>
            <Link href="/admin/members" className="text-sm text-gray-300 hover:text-white transition-colors">
              メンバー
            </Link>
            <Link href="/admin/settings" className="text-sm text-gray-300 hover:text-white transition-colors">
              設定
            </Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 統計 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: '登録顧客数', value: users.length, accent: 'bg-blue-600' },
            { label: '未割り当て', value: unassignedCount, accent: unassignedCount > 0 ? 'bg-orange-500' : 'bg-gray-300' },
            { label: '担当店舗数', value: stores.length, accent: 'bg-green-600' },
            { label: '身分証未提出', value: users.filter(u => !u.idDocumentPath).length, accent: 'bg-red-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className={`w-1.5 h-7 ${stat.accent} rounded-full mb-2`}></div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <h2 className="text-xl font-semibold text-gray-900 flex-none">顧客一覧</h2>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="氏名・メールで検索..."
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 w-56 bg-white"
          />
          <select
            value={filterStore}
            onChange={e => setFilterStore(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 bg-white"
          >
            <option value="">すべての店舗</option>
            <option value="unassigned">未割り当て</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">顧客名</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">連絡先</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">ライセンスキー</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">担当店舗</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">次回訪問</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">身分証</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(user => {
                const nextVisit = user.visitSchedules?.[0]
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-400">{user.furigana}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{user.email}</div>
                      <div className="text-xs text-gray-400">{user.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded-md">
                        {user.licenseKey.key}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      {user.store ? (
                        <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          {user.store.name}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                          未割り当て
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {nextVisit ? (
                        <span className="text-sm text-blue-700">
                          {format(new Date(nextVisit.visitDate), 'M/d（E）', { locale: ja })}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">未定</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.idDocumentPath ? (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">提出済</span>
                      ) : (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">未提出</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setDetailUser(user)}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors whitespace-nowrap"
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => { setAssigning({ userId: user.id, name: user.name }); setSelectedStore(user.store?.id || '') }}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap"
                        >
                          店舗割り当て
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-sm text-gray-400">該当する顧客がいません</div>
          )}
        </div>
      </div>

      {/* 顧客詳細モーダル */}
      {detailUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl flex flex-col max-h-[85vh]">

            {/* ヘッダー */}
            <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{detailUser.name} 様</h3>
                <p className="text-xs text-gray-400 mt-0.5">{detailUser.furigana}</p>
              </div>
              <button onClick={closeDetailModal} className="text-gray-300 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* タブ */}
            <div className="flex gap-1 px-6 py-3 border-b border-gray-50 flex-shrink-0">
              {([
                { id: 'info' as DetailTab, label: '基本情報' },
                { id: 'add' as DetailTab, label: 'スケジュール追加' },
                { id: 'history' as DetailTab, label: detailSchedules.length > 0 ? `訪問履歴（${detailSchedules.length}）` : '訪問履歴' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setDetailTab(tab.id); setScheduleMsg(null) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    detailTab === tab.id
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* 基本情報 */}
              {detailTab === 'info' && (
                <dl className="space-y-3">
                  {[
                    { label: 'メール', value: detailUser.email },
                    { label: '電話番号', value: detailUser.phone },
                    { label: '訪問先住所', value: detailUser.address },
                    { label: 'ライセンスキー', value: detailUser.licenseKey.key, mono: true },
                    { label: '担当店舗', value: detailUser.store?.name || '未割り当て' },
                    { label: '登録日', value: format(new Date(detailUser.createdAt), 'yyyy年M月d日', { locale: ja }) },
                  ].map(item => (
                    <div key={item.label} className="flex gap-4">
                      <dt className="w-32 text-sm text-gray-400 flex-shrink-0">{item.label}</dt>
                      <dd className={`text-sm text-gray-900 ${(item as any).mono ? 'font-mono text-xs' : ''}`}>{item.value}</dd>
                    </div>
                  ))}
                  <div className="flex gap-4">
                    <dt className="w-32 text-sm text-gray-400 flex-shrink-0">身分証</dt>
                    <dd className="text-sm">
                      {detailUser.idDocumentPath
                        ? <a href={detailUser.idDocumentPath} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">確認する</a>
                        : <span className="text-amber-600">未提出</span>
                      }
                    </dd>
                  </div>
                </dl>
              )}

              {/* スケジュール追加 */}
              {detailTab === 'add' && (
                <form onSubmit={handleAddSchedule} className="space-y-4">
                  {scheduleMsg && (
                    <div className={`px-3 py-2.5 rounded-xl text-sm ${
                      scheduleMsg.type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-100'
                        : 'bg-red-50 text-red-700 border border-red-100'
                    }`}>
                      {scheduleMsg.text}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      担当店舗 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={scheduleForm.storeId}
                      onChange={e => setScheduleForm({ ...scheduleForm, storeId: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                    >
                      <option value="">店舗を選択...</option>
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      訪問日 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={scheduleForm.visitDate}
                      onChange={e => setScheduleForm({ ...scheduleForm, visitDate: e.target.value })}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">メモ（任意）</label>
                    <textarea
                      value={scheduleForm.note}
                      onChange={e => setScheduleForm({ ...scheduleForm, note: e.target.value })}
                      placeholder="訪問に関するメモを入力..."
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={scheduleSubmitting || !scheduleForm.storeId || !scheduleForm.visitDate}
                    className="w-full bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
                  >
                    {scheduleSubmitting ? '追加中...' : 'スケジュールを追加'}
                  </button>
                </form>
              )}

              {/* 訪問履歴 */}
              {detailTab === 'history' && (
                <div>
                  {detailSchedulesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : sortedDetailSchedules.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-400">訪問スケジュールがありません</p>
                      <p className="text-xs text-gray-300 mt-1">「スケジュール追加」タブから登録できます</p>
                    </div>
                  ) : (
                    <div>
                      {sortedDetailSchedules.map(vs => (
                        <div key={vs.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900">
                                {format(new Date(vs.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                              </span>
                              <StatusBadge status={vs.status} />
                              <select
                                value={vs.status}
                                onChange={e => handleStatusChange(vs.id, e.target.value)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-gray-500 text-gray-600"
                              >
                                {STATUS_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{vs.store.name}</p>
                            {vs.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{vs.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
              <button
                onClick={closeDetailModal}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 店舗割り当てモーダル */}
      {assigning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-gray-900">店舗割り当て</h3>
              <button onClick={() => { setAssigning(null); setSelectedStore('') }} className="text-gray-300 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-semibold text-gray-900">{assigning.name}</span> の担当店舗を設定します
            </p>
            <select
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 mb-5"
            >
              <option value="">店舗を選択...</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setAssigning(null); setSelectedStore('') }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedStore}
                className="flex-1 bg-gray-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                割り当てる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
