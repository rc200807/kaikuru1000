'use client'

// ダッシュボード右側の追従サイドバー。直近の案件をカード表示し、
// 新規案件をリロードなしでリアルタイム（ポーリング差分）に上へ積み上げる。
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'
import type { RecentDeal } from '@/app/api/admin/dashboard/recent-deals/route'

const POLL_MS = 10_000
const MAX_ITEMS = 20

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  return `${day}日前`
}

export default function RecentDealsSidebar() {
  const [deals, setDeals] = useState<RecentDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const dealsRef = useRef<RecentDeal[]>([])
  dealsRef.current = deals

  // 初回ロード
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/dashboard/recent-deals')
      .then(r => (r.ok ? r.json() : { deals: [] }))
      .then((d: { deals: RecentDeal[] }) => { if (!cancelled) { setDeals(d.deals ?? []); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const poll = useCallback(async () => {
    if (document.hidden) return
    const latest = dealsRef.current[0]?.createdAt
    try {
      const url = latest
        ? `/api/admin/dashboard/recent-deals?since=${encodeURIComponent(latest)}`
        : '/api/admin/dashboard/recent-deals'
      const res = await fetch(url)
      if (!res.ok) return
      const data: { deals: RecentDeal[] } = await res.json()
      const fresh = (data.deals ?? []).filter(nd => !dealsRef.current.some(od => od.id === nd.id))
      if (fresh.length === 0) return
      setDeals(prev => [...fresh, ...prev].slice(0, MAX_ITEMS))
      setFlashIds(prev => {
        const next = new Set(prev)
        fresh.forEach(f => next.add(f.id))
        return next
      })
      // ハイライトを一定時間後に解除
      const ids = fresh.map(f => f.id)
      setTimeout(() => {
        setFlashIds(prev => {
          const next = new Set(prev)
          ids.forEach(id => next.delete(id))
          return next
        })
      }, 4000)
    } catch { /* 次回ポーリングで回復 */ }
  }, [])

  // ポーリング（10秒間隔・非表示タブはスキップ）
  useEffect(() => {
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [poll])

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: '#171717', border: '1px solid #262626', maxHeight: 'calc(100vh - 96px)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#262626' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#4ade80' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#22c55e' }} />
        </span>
        <h2 className="text-sm flex-1" style={{ color: '#ffffff', fontWeight: 600 }}>新着案件</h2>
        <span className="text-[11px]" style={{ color: '#737373' }}>リアルタイム</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-center text-xs py-8" style={{ color: '#737373' }}>読み込み中...</p>
        ) : deals.length === 0 ? (
          <p className="text-center text-xs py-8" style={{ color: '#737373' }}>案件はまだありません</p>
        ) : (
          deals.map(d => {
            const badge = DEAL_CATEGORY_BADGE[d.category]
            const flash = flashIds.has(d.id)
            return (
              <Link
                key={d.id}
                href={`/admin/deals?id=${d.id}`}
                className="block rounded-xl p-3 transition-colors"
                style={{
                  background: flash ? 'rgba(74,222,128,0.08)' : '#1f1f1f',
                  border: `1px solid ${flash ? 'rgba(74,222,128,0.4)' : '#2a2a2a'}`,
                  animation: flash ? 'dealCardIn 0.4s ease-out' : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold truncate" style={{ color: '#ffffff' }}>{d.customerName}</span>
                  {badge && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.fg }}>
                      {DEAL_CATEGORY_LABEL[d.category] ?? d.category}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 text-[11px]" style={{ color: '#a3a3a3' }}>
                  {d.area && <span>📍{d.area}</span>}
                  {d.storeName && <span>🏬{d.storeName}</span>}
                  {d.leadSource && (
                    <span className="px-1.5 py-0.5 rounded-full" style={{ background: '#262626', color: '#a3a3a3' }}>{d.leadSource}</span>
                  )}
                </div>
                {d.detail && (
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#d4d4d4' }}>{d.detail}</p>
                )}
                <p className="text-[10px] mt-1.5" style={{ color: '#525252' }}>{relativeTime(d.createdAt)}</p>
              </Link>
            )
          })
        )}
      </div>

      <style jsx>{`
        @keyframes dealCardIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
