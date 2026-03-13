'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type DashboardData = {
  summary: {
    totalCustomers: number
    currentMonthCustomers: number
    totalVisitsCount: number
    currentMonthVisits: number
  }
  storeRanking: { storeId: string; name: string; count: number }[]
  monthlyNewCustomers: { month: string; count: number }[]
  monthlyVisits: { month: string; count: number }[]
  dailyVisits: { date: string; count: number }[]
}

function AdminNav({ active }: { active: string }) {
  const { data: session } = useSession()
  const navItems = [
    { href: '/admin/dashboard', label: 'ダッシュボード' },
    { href: '/admin/customers', label: '顧客管理' },
    { href: '/admin/stores', label: '店舗管理' },
    { href: '/admin/visits', label: '訪問記録' },
    { href: '/admin/licenses', label: 'ライセンスキー' },
    { href: '/admin/members', label: 'メンバー' },
    { href: '/admin/settings', label: '設定' },
  ]
  return (
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
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm transition-colors ${active === item.label
                ? 'font-medium text-white border-b border-white pb-0.5'
                : 'text-gray-300 hover:text-white'}`}
            >
              {item.label}
            </Link>
          ))}
          <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-gray-400 hover:text-white transition-colors ml-2">
            ログアウト
          </button>
        </nav>
      </div>
    </header>
  )
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as any
    if (user.role !== 'admin') { router.push('/'); return }
    fetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [status, session, router])

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#FFFBFE]">
        <AdminNav active="ダッシュボード" />
        <div className="flex items-center justify-center h-96">
          <div className="w-8 h-8 border-4 border-red-700 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const { summary, storeRanking, monthlyNewCustomers, monthlyVisits, dailyVisits } = data
  const maxStoreCount = Math.max(...storeRanking.map(s => s.count), 1)

  const summaryCards = [
    { label: '総顧客数', value: summary.totalCustomers, unit: '名', color: 'bg-blue-600' },
    { label: '当月新規顧客', value: summary.currentMonthCustomers, unit: '名', color: 'bg-red-600' },
    { label: '総訪問数', value: summary.totalVisitsCount, unit: '件', color: 'bg-emerald-600' },
    { label: '当月訪問数', value: summary.currentMonthVisits, unit: '件', color: 'bg-amber-500' },
  ]

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <AdminNav active="ダッシュボード" />

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* サマリーカード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map(card => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className={`w-2 self-stretch rounded-full ${card.color}`} />
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {card.value.toLocaleString()}
                  <span className="text-base font-normal text-gray-500 ml-1">{card.unit}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 店舗ランキング ＋ 月次新規顧客 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 店舗別当月顧客数ランキング */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">店舗別顧客数ランキング（当月 TOP10）</h2>
            {storeRanking.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">当月のデータがありません</p>
            ) : (
              <div className="space-y-3">
                {storeRanking.map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center ${i < 3 ? 'text-red-600' : 'text-gray-400'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 w-28 truncate">{store.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full transition-all"
                        style={{ width: `${(store.count / maxStoreCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 w-8 text-right">{store.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 月次新規顧客数 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">新規顧客獲得数の推移（月次）</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyNewCustomers} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [`${v}名`, '新規顧客']} />
                <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 月次訪問数推移 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">訪問件数の推移（月次）</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyVisits} margin={{ top: 0, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v: any) => [`${v}件`, '訪問数']} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 3, fill: '#dc2626' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 日次訪問数 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">訪問件数の推移（直近30日）</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyVisits} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval={4}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v: any) => [`${v}件`, '訪問数']} />
              <Bar dataKey="count" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  )
}
