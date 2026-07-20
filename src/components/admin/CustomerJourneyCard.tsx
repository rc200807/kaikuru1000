'use client'

// 顧客詳細モーダル内の「流入経路」セクション。
// 顧客に紐付くアクセス計測の訪問者があれば、初回流入とジャーニー要約を表示する。
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CHANNEL_LABEL } from '@/lib/tracking-labels'
import type { TrackingVisitorRow } from '@/lib/tracking-types'

export default function CustomerJourneyCard({ userId }: { userId: string }) {
  const [visitors, setVisitors] = useState<TrackingVisitorRow[] | null>(null)

  useEffect(() => {
    setVisitors(null)
    fetch(`/api/admin/tracking/visitors?userId=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setVisitors(d?.visitors ?? []))
      .catch(() => setVisitors([]))
  }, [userId])

  if (visitors === null || visitors.length === 0) return null // 計測データがない顧客には何も出さない

  return (
    <div className="rounded-xl p-3.5 border border-[var(--md-sys-color-outline-variant)]">
      <p className="text-[10px] font-semibold mb-2 text-[var(--md-sys-color-on-surface-variant)]">🛬 流入経路（アクセス計測）</p>
      <div className="space-y-2">
        {visitors.map(v => (
          <div key={v.id} className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]">
              {v.channel ? (CHANNEL_LABEL[v.channel] ?? v.channel) : '不明'}
            </span>
            <span className="text-[var(--md-sys-color-on-surface)]">
              {v.firstReferrer ? (() => { try { return new URL(v.firstReferrer!).hostname } catch { return v.firstReferrer } })() : '直接流入'}
            </span>
            <span className="text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
              訪問{v.sessionCount}回 ・ CV{v.conversionCount}件
              {v.region ? ` ・ ${v.region}` : ''}
            </span>
            <Link
              href={`/admin/analytics/visitors/${v.id}`}
              className="ml-auto text-[10px] text-[var(--md-sys-color-primary,#4f8ef7)] hover:underline"
            >
              ジャーニー詳細 →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
