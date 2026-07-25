'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatJstDate } from '@/lib/datetime'
import { getReleaseCategory, NoticeIcon } from '@/components/release-notes/categories'

type ReleaseNote = {
  id: string
  version: string | null
  title: string
  content: string
  category: string
  publishedAt: string | null
  isRead: boolean
}

const MAX_VISIBLE = 6

export default function StoreReleaseNotesCard() {
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/store/release-notes')
      .then(r => (r.ok ? r.json() : []))
      .then((data: ReleaseNote[]) => {
        if (cancelled) return
        setNotes(data)
        setLoaded(true)
        // 未読があればすべて既読化し、ナビの未読バッジを消す
        if (data.some(n => !n.isRead)) {
          fetch('/api/store/release-notes/read', { method: 'POST' })
            .then(() => window.dispatchEvent(new Event('releasenotes:read')))
            .catch(() => {})
        }
      })
      .catch(() => setLoaded(true))
    return () => { cancelled = true }
  }, [])

  if (!loaded || notes.length === 0) return null

  const unreadCount = notes.filter(n => !n.isRead).length
  const visible = notes.slice(0, MAX_VISIBLE)

  return (
    <section className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
          <NoticeIcon className="w-4 h-4" /> アップデート情報
        </h2>
        {unreadCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--store-primary)] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
        {visible.map(n => {
          const cat = getReleaseCategory(n.category)
          return (
            <div key={n.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                href={`/store/release-notes/${n.id}`}
                className="w-full text-left flex items-start gap-2"
              >
                <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    <cat.Icon className="w-3 h-3" /> {cat.label}
                  </span>
                  {n.version && (
                    <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] shrink-0">{n.version}</span>
                  )}
                  {!n.isRead && (
                    <span className="text-[10px] font-bold text-[var(--store-primary)] shrink-0">● NEW</span>
                  )}
                  <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{n.title}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {n.publishedAt && (
                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-faint)]">
                      {formatJstDate(n.publishedAt, { year: undefined, month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <svg
                    className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 flex items-center justify-between border-t border-[var(--md-sys-color-outline-variant)]">
        {notes.length > MAX_VISIBLE ? (
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-faint)]">ほか {notes.length - MAX_VISIBLE} 件</span>
        ) : <span />}
        <Link href="/store/release-notes" className="text-xs font-medium inline-flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)]">
          すべて見る
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </section>
  )
}
