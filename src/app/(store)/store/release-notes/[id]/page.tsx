'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatJstDate } from '@/lib/datetime'
import { getReleaseCategory } from '@/components/release-notes/categories'

type ReleaseNote = {
  id: string
  version: string | null
  title: string
  content: string
  category: string
  publishedAt: string | null
  isRead: boolean
}

export default function StoreReleaseNoteDetailPage() {
  const params = useParams<{ id: string }>()
  const [note, setNote] = useState<ReleaseNote | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/store/release-notes/${params.id}`)
      .then(r => { if (r.status === 404) { if (!cancelled) setNotFound(true); return null } return r.ok ? r.json() : null })
      .then((data: ReleaseNote | null) => {
        if (cancelled || !data) return
        setNote(data)
        if (!data.isRead) {
          fetch('/api/store/release-notes/read', { method: 'POST' })
            .then(() => window.dispatchEvent(new Event('releasenotes:read')))
            .catch(() => {})
        }
      })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [params.id])

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-[var(--md-sys-color-on-surface)]">
      <Link href="/store/release-notes" className="text-xs text-[var(--md-sys-color-on-surface-variant)]">← アップデート情報一覧</Link>

      {!loaded ? (
        <p className="mt-6 text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
      ) : notFound || !note ? (
        <p className="mt-6 text-sm text-[var(--md-sys-color-on-surface-variant)]">アップデート情報が見つかりません。</p>
      ) : (
        <article className="mt-4 rounded-2xl p-6 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
          {(() => {
            const cat = getReleaseCategory(note.category)
            return (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cat.color }}>
                  <cat.Icon className="w-3 h-3" /> {cat.label}
                </span>
                {note.version && <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">{note.version}</span>}
                {note.publishedAt && (
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-faint)]">
                    {formatJstDate(note.publishedAt, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </span>
                )}
              </div>
            )
          })()}
          <h1 className="text-lg font-bold mb-4">{note.title}</h1>
          <div
            className="prose prose-sm max-w-none text-[var(--md-sys-color-on-surface)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        </article>
      )}
    </div>
  )
}
