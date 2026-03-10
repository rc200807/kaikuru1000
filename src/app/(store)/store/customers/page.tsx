'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  createdAt: string
  visitSchedules: Array<{ visitDate: string; status: string }>
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

type ModalTab = 'info' | 'add' | 'history'

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // モーダル
  const [selected, setSelected] = useState<Customer | null>(null)
  const [modalTab, setModalTab] = useState<ModalTab>('info')
  const [schedules, setSchedules] = useState<VisitSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)

  // スケジュール追加フォーム
  const [addForm, setAddForm] = useState({ visitDate: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}/customers`)
        .then(r => r.json())
        .then(data => {
          setCustomers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  // 顧客選択時にスケジュール一覧を取得
  useEffect(() => {
    if (!selected) return
    setModalTab('info')
    setScheduleMsg(null)
    setAddForm({ visitDate: '', note: '' })
    setSchedulesLoading(true)
    setSchedules([])
    fetch(`/api/visit-schedules?userId=${selected.id}`)
      .then(r => r.json())
      .then(data => {
        setSchedules(Array.isArray(data) ? data : [])
        setSchedulesLoading(false)
      })
      .catch(() => setSchedulesLoading(false))
  }, [selected])

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !addForm.visitDate) return
    const storeId = (session?.user as any).id
    setSubmitting(true)
    setScheduleMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selected.id,
        storeId,
        visitDate: addForm.visitDate,
        note: addForm.note || undefined,
      }),
    })

    setSubmitting(false)

    if (res.ok) {
      const created = await res.json()
      setSchedules(prev => [created, ...prev])
      // 顧客一覧の次回訪問日を更新
      setCustomers(prev => prev.map(c =>
        c.id === selected.id
          ? { ...c, visitSchedules: [{ visitDate: created.visitDate, status: 'scheduled' }] }
          : c
      ))
      setScheduleMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setAddForm({ visitDate: '', note: '' })
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
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  function closeModal() {
    setSelected(null)
    setSchedules([])
    setScheduleMsg(null)
  }

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.furigana.includes(search) ||
    c.email.includes(search) || c.phone.includes(search)
  )

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <header className="bg-blue-800 text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/store/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {(session?.user as any)?.avatar ? (
              <img src={(session?.user as any)?.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-blue-600" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-600 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{(session?.user as any)?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div>
              <p className="text-blue-300 text-xs font-medium tracking-widest uppercase">買いクル 店舗ポータル</p>
              <h1 className="text-base font-semibold mt-0.5">{(session?.user as any)?.name}</h1>
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/store/customers" className="text-sm font-medium text-white border-b border-white pb-0.5">
              担当顧客
            </Link>
            <Link href="/store/schedule" className="text-sm text-blue-200 hover:text-white transition-colors">
              訪問スケジュール
            </Link>
            <Link href="/store/members" className="text-sm text-blue-200 hover:text-white transition-colors">
              メンバー
            </Link>
            <Link href="/store/mystore" className="text-sm text-blue-200 hover:text-white transition-colors">
              店舗情報
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-blue-300 hover:text-white transition-colors ml-2"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-blue-500">ログイン中の店舗</p>
            <p className="text-sm font-semibold text-blue-900">{(session?.user as any)?.name}</p>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            担当顧客一覧
            <span className="ml-3 text-sm font-normal text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {customers.length}名
            </span>
          </h2>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="氏名・メール・電話で検索..."
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 w-64 bg-white"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-sm text-gray-400 border border-gray-100">
            {customers.length === 0 ? '担当顧客がいません' : '検索結果がありません'}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">氏名</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">連絡先</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">住所</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">次回訪問</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">身分証</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(customer => {
                  const nextVisit = customer.visitSchedules?.[0]
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                        <div className="text-xs text-gray-400">{customer.furigana}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-700">{customer.phone}</div>
                        <div className="text-xs text-gray-400">{customer.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 max-w-48 truncate">{customer.address}</div>
                      </td>
                      <td className="px-6 py-4">
                        {nextVisit ? (
                          <span className="text-sm font-medium text-blue-700">
                            {format(new Date(nextVisit.visitDate), 'M/d（E）', { locale: ja })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">未定</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.idDocumentPath ? (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">提出済</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">未提出</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelected(customer)}
                          className="text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
                        >
                          詳細
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 顧客詳細モーダル */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl flex flex-col max-h-[85vh]">

            {/* ヘッダー */}
            <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selected.name} 様</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selected.furigana}</p>
              </div>
              <button onClick={closeModal} className="text-gray-300 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* タブ */}
            <div className="flex gap-1 px-6 py-3 border-b border-gray-50 flex-shrink-0">
              {([
                { id: 'info' as ModalTab, label: '基本情報' },
                { id: 'add' as ModalTab, label: 'スケジュール追加' },
                { id: 'history' as ModalTab, label: schedules.length > 0 ? `訪問履歴（${schedules.length}）` : '訪問履歴' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setModalTab(tab.id); setScheduleMsg(null) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    modalTab === tab.id
                      ? 'bg-blue-800 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* コンテンツ（スクロール可） */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* 基本情報 */}
              {modalTab === 'info' && (
                <dl className="space-y-3">
                  {[
                    { label: 'メール', value: selected.email },
                    { label: '電話番号', value: selected.phone },
                    { label: '訪問先住所', value: selected.address },
                    { label: '登録日', value: format(new Date(selected.createdAt), 'yyyy年M月d日', { locale: ja }) },
                  ].map(item => (
                    <div key={item.label} className="flex gap-4">
                      <dt className="w-28 text-sm text-gray-400 flex-shrink-0">{item.label}</dt>
                      <dd className="text-sm text-gray-900">{item.value}</dd>
                    </div>
                  ))}
                  <div className="flex gap-4">
                    <dt className="w-28 text-sm text-gray-400 flex-shrink-0">身分証</dt>
                    <dd className="text-sm">
                      {selected.idDocumentPath
                        ? <a href={selected.idDocumentPath} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">確認する</a>
                        : <span className="text-amber-600">未提出</span>
                      }
                    </dd>
                  </div>
                </dl>
              )}

              {/* スケジュール追加 */}
              {modalTab === 'add' && (
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
                      訪問日 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={addForm.visitDate}
                      onChange={e => setAddForm({ ...addForm, visitDate: e.target.value })}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">メモ（任意）</label>
                    <textarea
                      value={addForm.note}
                      onChange={e => setAddForm({ ...addForm, note: e.target.value })}
                      placeholder="訪問に関するメモを入力..."
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !addForm.visitDate}
                    className="w-full bg-blue-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-blue-900 transition-colors disabled:opacity-50"
                  >
                    {submitting ? '追加中...' : 'スケジュールを追加'}
                  </button>
                </form>
              )}

              {/* 訪問履歴 */}
              {modalTab === 'history' && (
                <div>
                  {schedulesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : sortedSchedules.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-400">訪問スケジュールがありません</p>
                      <p className="text-xs text-gray-300 mt-1">「スケジュール追加」タブから登録できます</p>
                    </div>
                  ) : (
                    <div>
                      {sortedSchedules.map(vs => (
                        <div key={vs.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600"
                              >
                                {STATUS_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            {vs.note && <p className="text-xs text-gray-500 mt-0.5 truncate">{vs.note}</p>}
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
                onClick={closeModal}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
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
