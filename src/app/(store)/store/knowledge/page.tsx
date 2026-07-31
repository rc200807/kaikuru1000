'use client'

// 店舗向けナレッジベース。AIチャットと、公開されたFAQの閲覧。
// 登録・編集は管理ポータル専用なので、ここは読み取りのみ。
// 店舗ポータルは data-portal でテーマ固定のため Tailwind の dark: は使わない。
import { useState, useEffect, useMemo } from 'react'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import KnowledgeChat from '@/components/knowledge/KnowledgeChat'
import { faqHtmlToText } from '@/lib/faq-sanitize'

type Category = { id: string; name: string; color: string; _count: { faqs: number } }
type Faq = {
  id: string
  question: string
  answer: string
  updatedAt: string
  category: { id: string; name: string; color: string } | null
}

type Tab = 'chat' | 'list'

const SUGGESTIONS = [
  '買取の流れを教えて',
  '身分証はどれが使えますか？',
  'キャンセルはできますか？',
  '査定額はどうやって決まりますか？',
]

export default function StoreKnowledgePage() {
  const [tab, setTab] = useState<Tab>('chat')
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/store/knowledge/faqs').then(r => (r.ok ? r.json() : [])),
      fetch('/api/store/knowledge/categories').then(r => (r.ok ? r.json() : [])),
    ])
      .then(([f, c]) => {
        if (cancelled) return
        setFaqs(Array.isArray(f) ? f : [])
        setCategories(Array.isArray(c) ? c : [])
      })
      .catch(() => { /* 取得できなくてもチャットは使えるので画面は出す */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return faqs.filter(f => {
      if (catFilter && f.category?.id !== catFilter) return false
      if (!q) return true
      return [f.question, faqHtmlToText(f.answer), f.category?.name ?? ''].join(' ').toLowerCase().includes(q)
    })
  }, [faqs, search, catFilter])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <>
      <AppBar title="ナレッジベース" subtitle="よくある質問と、AIへの相談ができます" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 text-[var(--md-sys-color-on-surface)]">
        {/* タブ */}
        <div className="flex gap-1 mb-4 border-b border-[var(--md-sys-color-outline-variant)]">
          {([
            { key: 'chat', label: 'AIに聞く' },
            { key: 'list', label: `FAQ一覧（${faqs.length}）` },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2.5 text-sm font-medium -mb-px border-b-2"
              style={
                tab === t.key
                  ? { borderColor: 'var(--store-primary)', color: 'var(--md-sys-color-on-surface)' }
                  : { borderColor: 'transparent', color: 'var(--md-sys-color-on-surface-variant)' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'chat' && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
              本部が登録したFAQを元にAIが回答します。解決しない場合は本部チャットからお問い合わせください。
            </p>
            <KnowledgeChat
              endpoint="/api/store/knowledge/chat"
              accent="var(--store-primary)"
              accentText="var(--store-on-primary, #ffffff)"
              suggestions={SUGGESTIONS}
            />
          </>
        )}

        {tab === 'list' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="キーワードで検索..."
                className="w-full h-10 px-3 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] outline-none"
              />
              {categories.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setCatFilter('')}
                    className="text-xs px-2.5 py-1 rounded-full border"
                    style={catFilter === ''
                      ? { background: 'var(--store-primary)', color: '#fff', borderColor: 'var(--store-primary)' }
                      : { borderColor: 'var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface-variant)' }}
                  >
                    すべて
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCatFilter(c.id)}
                      className="text-xs px-2.5 py-1 rounded-full border"
                      style={catFilter === c.id
                        ? { background: c.color, color: '#fff', borderColor: c.color }
                        : { borderColor: 'var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface-variant)' }}
                    >
                      {c.name}（{c._count.faqs}）
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-10 text-center">
                {faqs.length === 0 ? 'FAQはまだ公開されていません' : '該当するFAQがありません'}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map(f => {
                  const open = expanded.has(f.id)
                  return (
                    <div
                      key={f.id}
                      className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-hidden"
                    >
                      <button
                        onClick={() => toggle(f.id)}
                        className="w-full flex items-start gap-3 text-left px-4 py-3 hover:bg-[var(--md-sys-color-surface-container-low)]"
                        aria-expanded={open}
                      >
                        <div className="flex-1 min-w-0">
                          {f.category && (
                            <span
                              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white mb-1.5"
                              style={{ background: f.category.color }}
                            >
                              {f.category.name}
                            </span>
                          )}
                          <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{f.question}</div>
                        </div>
                        <svg
                          className={`w-4 h-4 mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {open && (
                        <div
                          className="faq-content px-4 pb-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]"
                          dangerouslySetInnerHTML={{ __html: f.answer }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
