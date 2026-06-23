'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

type RankingData = {
  customerRanking: { storeId: string; name: string; count: number }[]
  purchaseRanking: { storeId: string; name: string; amount: number }[]
  period: string
}

const PERIOD_OPTIONS = [
  { value: 'month', label: '当月' },
  { value: 'year', label: '今年' },
  { value: 'all', label: '全期間' },
]

function fmtYen(n: number) {
  if (n >= 100_000_000) return `¥${(n / 100_000_000).toFixed(1)}億`
  if (n >= 10_000) return `¥${Math.round(n / 10_000)}万`
  return `¥${n.toLocaleString()}`
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, { bg: string; text: string }> = {
    1: { bg: '#ca8a04', text: '#ffffff' },
    2: { bg: '#6b7280', text: '#ffffff' },
    3: { bg: '#92400e', text: '#ffffff' },
  }
  const style = colors[rank] ?? { bg: '#262626', text: '#a3a3a3' }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0"
      style={{ background: style.bg, color: style.text }}
    >
      {rank}
    </span>
  )
}

export default function RankingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as any
    if (!['admin', 'superadmin', 'hr'].includes(user.role)) { router.push('/'); return }
    setLoading(true)
    fetch(`/api/admin/rankings?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [status, session, router, period])

  if (loading || !data) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const maxPurchase = Math.max(...data.purchaseRanking.map(s => s.amount), 1)
  const maxCustomer = Math.max(...data.customerRanking.map(s => s.count), 1)

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <AppBar
        title="店舗別ランキング"
        subtitle="全店舗の成績一覧"
        actions={
          <Link href="/admin/dashboard" className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#262626', color: '#a3a3a3' }}>
            ← 戻る
          </Link>
        }
      />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* 買取金額ランキング（全期間） */}
        <div className="rounded-2xl p-5" style={{ background: '#171717', border: '1px solid #262626' }}>
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold" style={{ color: '#ffffff' }}>
              店舗別買取金額ランキング
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#262626', color: '#a3a3a3' }}>
              全期間
            </span>
            <span className="ml-auto text-xs" style={{ color: '#525252' }}>
              {data.purchaseRanking.length} 店舗
            </span>
          </div>

          {data.purchaseRanking.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#525252' }}>買取実績がありません</p>
          ) : (
            <div className="space-y-3">
              {data.purchaseRanking.map((store, i) => (
                <div key={store.storeId} className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <span className="text-xs w-32 truncate flex-shrink-0" style={{ color: '#e5e5e5' }}>
                    {store.name}
                  </span>
                  <div className="flex-1 rounded-full h-1.5" style={{ background: '#262626' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${(store.amount / maxPurchase) * 100}%`,
                        background: i === 0 ? '#ca8a04' : i === 1 ? '#9ca3af' : i === 2 ? '#92400e' : '#ffffff',
                      }}
                    />
                  </div>
                  <span className="text-xs w-20 text-right flex-shrink-0 font-semibold" style={{ color: '#e5e5e5' }}>
                    {fmtYen(store.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 顧客数ランキング（期間切替） */}
        <div className="rounded-2xl p-5" style={{ background: '#171717', border: '1px solid #262626' }}>
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <h2 className="text-sm font-semibold" style={{ color: '#ffffff' }}>
              店舗別顧客数ランキング
            </h2>
            <div className="flex gap-1 ml-auto">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className="text-xs px-3 py-1 rounded-full transition-colors"
                  style={
                    period === opt.value
                      ? { background: '#ffffff', color: '#0a0a0a', fontWeight: 600 }
                      : { background: '#262626', color: '#a3a3a3' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs w-full mt-1" style={{ color: '#525252' }}>
              {data.customerRanking.length} 店舗
            </span>
          </div>

          {data.customerRanking.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#525252' }}>期間内の顧客データがありません</p>
          ) : (
            <div className="space-y-3">
              {data.customerRanking.map((store, i) => (
                <div key={store.storeId} className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <span className="text-xs w-32 truncate flex-shrink-0" style={{ color: '#e5e5e5' }}>
                    {store.name}
                  </span>
                  <div className="flex-1 rounded-full h-1.5" style={{ background: '#262626' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${(store.count / maxCustomer) * 100}%`,
                        background: i === 0 ? '#ca8a04' : i === 1 ? '#9ca3af' : i === 2 ? '#92400e' : '#ffffff',
                      }}
                    />
                  </div>
                  <span className="text-xs w-12 text-right flex-shrink-0 font-semibold" style={{ color: '#e5e5e5' }}>
                    {store.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
