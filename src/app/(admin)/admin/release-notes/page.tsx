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

export default function AdminReleaseNotesListPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [loaded, setLoaded] = useState(false)

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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6" style={{ color: '#ededed' }}>
      <Link href="/admin/dashboard" className="text-xs" style={{ color: '#a3a3a3' }}>← ダッシュボード</Link>
      <h1 className="mt-3 mb-5 text-xl font-bold inline-flex items-center gap-2">
        <NoticeIcon className="w-5 h-5" /> アップデート情報
      </h1>

      {!loaded ? (
        <p className="text-sm" style={{ color: '#a3a3a3' }}>読み込み中…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm py-12 text-center" style={{ color: '#a3a3a3' }}>アップデート情報はありません。</p>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#171717', border: '1px solid #262626' }}>
          {notes.map((n, i) => {
            const cat = getReleaseCategory(n.category)
            return (
              <Link
                key={n.id}
                href={`/admin/release-notes/${n.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#1f1f1f]"
                style={{ borderTop: i === 0 ? 'none' : '1px solid #262626' }}
              >
                <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: cat.color }}>
                    <cat.Icon className="w-3 h-3" /> {cat.label}
                  </span>
                  {n.version && <span className="text-[11px] font-mono shrink-0" style={{ color: '#a3a3a3' }}>{n.version}</span>}
                  {!n.isRead && <span className="text-[10px] font-bold shrink-0" style={{ color: '#f87171' }}>● NEW</span>}
                  <span className="text-sm font-semibold truncate" style={{ color: '#ededed' }}>{n.title}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {n.publishedAt && (
                    <span className="text-[11px]" style={{ color: '#666666' }}>
                      {formatJstDate(n.publishedAt, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <svg className="w-4 h-4" style={{ color: '#a3a3a3' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
