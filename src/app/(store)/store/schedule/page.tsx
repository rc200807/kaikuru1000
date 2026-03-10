'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type Schedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  user: { id: string; name: string; address: string; phone: string }
  store: { id: string; name: string }
}

type Customer = {
  id: string
  name: string
  furigana: string
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

export default function StoreSchedulePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({ userId: '', visitDate: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      Promise.all([
        fetch(`/api/visit-schedules?storeId=${storeId}`).then(r => r.json()),
        fetch(`/api/stores/${storeId}/customers`).then(r => r.json()),
      ]).then(([schedData, custData]) => {
        setSchedules(Array.isArray(schedData) ? schedData : [])
        setCustomers(Array.isArray(custData) ? custData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

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

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const storeId = (session?.user as any).id

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, storeId }),
    })

    setSaving(false)
    if (res.ok) {
      const newSchedule = await res.json()
      setSchedules(prev => [...prev, newSchedule].sort((a, b) =>
        new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime()
      ))
      setMessage({ type: 'success', text: '訪問スケジュールを登録しました' })
      setShowForm(false)
      setFormData({ userId: '', visitDate: '', note: '' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '登録に失敗しました' })
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = schedules.filter(s =>
    new Date(s.visitDate) >= today && !['completed', 'cancelled', 'absent'].includes(s.status)
  )
  const past = schedules
    .filter(s =>
      new Date(s.visitDate) < today || ['completed', 'cancelled', 'absent'].includes(s.status)
    )
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())

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
            <Link href="/store/customers" className="text-sm text-blue-200 hover:text-white transition-colors">
              担当顧客
            </Link>
            <Link href="/store/schedule" className="text-sm font-medium text-white border-b border-white pb-0.5">
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
          <h2 className="text-xl font-semibold text-gray-900">訪問スケジュール</h2>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-800 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-blue-900 transition-colors"
          >
            スケジュール追加
          </button>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* 今後の予定 */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">今後の訪問予定</h3>
          {upcoming.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-400 border border-gray-100">
              スケジュールがありません
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(schedule => (
                <div key={schedule.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-4">
                  <div className="bg-blue-50 text-blue-800 rounded-xl p-3 text-center min-w-16 flex-shrink-0">
                    <div className="text-xs font-medium">{format(new Date(schedule.visitDate), 'M月', { locale: ja })}</div>
                    <div className="text-2xl font-bold leading-none">{format(new Date(schedule.visitDate), 'd', { locale: ja })}</div>
                    <div className="text-xs">{format(new Date(schedule.visitDate), '（E）', { locale: ja })}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{schedule.user.name} 様</p>
                    <p className="text-sm text-gray-500 mt-0.5">{schedule.user.address}</p>
                    <p className="text-sm text-gray-500">{schedule.user.phone}</p>
                    {schedule.note && <p className="text-xs text-blue-600 mt-1">{schedule.note}</p>}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <StatusBadge status={schedule.status} />
                      <select
                        value={schedule.status}
                        onChange={e => handleStatusChange(schedule.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 過去の訪問 */}
        {past.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">過去の訪問</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">訪問日</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">顧客名</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">住所</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">対応ステータス</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400">メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {past.map(schedule => (
                    <tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {format(new Date(schedule.visitDate), 'yyyy/M/d（E）', { locale: ja })}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{schedule.user.name}</td>
                      <td className="px-6 py-3 text-sm text-gray-500 max-w-48 truncate">{schedule.user.address}</td>
                      <td className="px-6 py-3">
                        <select
                          value={schedule.status}
                          onChange={e => handleStatusChange(schedule.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600"
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-400">{schedule.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* スケジュール追加モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-gray-900">訪問スケジュール追加</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-300 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  顧客 <span className="text-red-600">*</span>
                </label>
                <select
                  value={formData.userId}
                  onChange={e => setFormData({ ...formData, userId: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="">顧客を選択...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}（{c.furigana}）</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  訪問日 <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={formData.visitDate}
                  onChange={e => setFormData({ ...formData, visitDate: e.target.value })}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">メモ（任意）</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                  placeholder="初回訪問、など"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors">
                  キャンセル
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-800 text-white py-2.5 rounded-full text-sm font-medium hover:bg-blue-900 transition-colors disabled:opacity-50">
                  {saving ? '登録中...' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
