'use client'

import { useEffect, useState } from 'react'
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

export default function AdminReleaseNotesCard() {
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/release-notes')
      .then(r => (r.ok ? r.json() : []))
      .then((data: ReleaseNote[]) => {
        if (cancelled) return
        setNotes(data)
        setLoaded(true)
        if (data.some(n => !n.isRead)) {
          fetch('/api/admin/release-notes/read', { method: 'POST' })
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
    <section className="rounded-2xl p-5" style={{ background: '#171717', border: '1px solid #262626' }}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#ffffff', fontWeight: 600 }}>
          <NoticeIcon className="w-4 h-4" /> アップデート情報
        </h2>
        {unreadCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: '#dc2626' }}>
            {unreadCount}
          </span>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: '#262626' }}>
        {visible.map(n => {
          const cat = getReleaseCategory(n.category)
          const open = openId === n.id
          return (
            <div key={n.id} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: '#262626' }}>
              <button
                onClick={() => setOpenId(open ? null : n.id)}
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
                    <span className="text-[11px] font-mono shrink-0" style={{ color: '#a3a3a3' }}>{n.version}</span>
                  )}
                  {!n.isRead && (
                    <span className="text-[10px] font-bold shrink-0" style={{ color: '#f87171' }}>● NEW</span>
                  )}
                  <span className="text-sm font-semibold truncate" style={{ color: '#ededed' }}>{n.title}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {n.publishedAt && (
                    <span className="text-[11px]" style={{ color: '#666666' }}>
                      {formatJstDate(n.publishedAt, { year: undefined, month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                    style={{ color: '#a3a3a3' }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {open && (
                <div
                  className="prose prose-sm prose-invert max-w-none leading-relaxed mt-2 pl-0.5"
                  dangerouslySetInnerHTML={{ __html: n.content }}
                />
              )}
            </div>
          )
        })}
      </div>

      {notes.length > MAX_VISIBLE && (
        <p className="text-[11px] mt-3" style={{ color: '#666666' }}>
          ほか {notes.length - MAX_VISIBLE} 件のアップデートがあります
        </p>
      )}
    </section>
  )
}
