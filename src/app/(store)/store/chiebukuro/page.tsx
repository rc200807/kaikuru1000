'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import { CHIEBUKURO_CATEGORIES } from '@/lib/chiebukuro'
import ChiebukuroCategoryIcon from '@/components/chiebukuro/CategoryIcon'

type Question = {
  id: string
  title: string
  excerpt: string
  category: string
  authorName: string
  isResolved: boolean
  answerCount: number
  reactionCount: number
  createdAt: string
}

export default function ChiebukuroPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', category: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (status === 'unauthenticated') router.push('/store/login') }, [status, router])

  const load = useCallback(async (cat: string, q: string) => {
    const qs = new URLSearchParams()
    if (cat) qs.set('category', cat)
    if (q) qs.set('search', q)
    const res = await fetch(`/api/store/chiebukuro/questions?${qs.toString()}`)
    if (res.ok) { const d = await res.json(); setQuestions(d.questions ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    const t = setTimeout(() => load(category, search), 250)
    return () => clearTimeout(t)
  }, [status, category, search, load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/store/chiebukuro/questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      const d = await res.json()
      setShowForm(false)
      setForm({ title: '', body: '', category: '' })
      router.push(`/store/chiebukuro/${d.id}`)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || '投稿に失敗しました')
    }
  }

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />

  return (
    <>
      <AppBar
        title="知恵袋"
        subtitle="店舗どうしで質問・相談し合えるQ&A"
        actions={
          <Button size="sm" onClick={() => { setShowForm(true); setError('') }}>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              質問する
            </span>
          </Button>
        }
      />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 検索 */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="キーワードで検索"
          className="w-full h-10 rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] px-4 text-sm mb-3"
        />

        {/* カテゴリ絞り込み */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${category === '' ? 'bg-[var(--store-primary)] text-white border-[var(--store-primary)]' : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'}`}
          >
            すべて
          </button>
          {CHIEBUKURO_CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${category === c.key ? 'bg-[var(--store-primary)] text-white border-[var(--store-primary)]' : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'}`}
            >
              <ChiebukuroCategoryIcon category={c.key} className="w-4 h-4" /> {c.key}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingSpinner size="md" />
        ) : questions.length === 0 ? (
          <EmptyState title="質問がありません" description="「質問する」から最初の質問を投稿してみましょう" />
        ) : (
          <div className="space-y-3">
            {questions.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => router.push(`/store/chiebukuro/${q.id}`)}
                className="w-full text-left rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-4 hover:border-[var(--store-primary)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                    <ChiebukuroCategoryIcon category={q.category} className="w-3.5 h-3.5" /> {q.category}
                  </span>
                  {q.isResolved && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">解決済み</span>
                  )}
                  <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    回答 {q.answerCount}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{q.title}</h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 line-clamp-2">{q.excerpt}</p>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-2">
                  {q.authorName}・{format(new Date(q.createdAt), 'yyyy年M月d日', { locale: ja })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 質問投稿モーダル */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setForm({ title: '', body: '', category: '' }) }}
        title="質問する"
        size="md"
        footer={
          <>
            <Button variant="text" onClick={() => { setShowForm(false); setForm({ title: '', body: '', category: '' }) }}>キャンセル</Button>
            <Button loading={saving} onClick={() => (document.getElementById('chiebukuro-form') as HTMLFormElement)?.requestSubmit()}>
              {saving ? '投稿中…' : '投稿する'}
            </Button>
          </>
        }
      >
        <form id="chiebukuro-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">カテゴリ *</label>
            <div className="flex flex-wrap gap-2">
              {CHIEBUKURO_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setForm({ ...form, category: c.key })}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-colors ${form.category === c.key ? 'bg-[var(--store-primary)] text-white border-[var(--store-primary)]' : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]'}`}
                >
                  <ChiebukuroCategoryIcon category={c.key} className="w-4 h-4" /> {c.key}
                </button>
              ))}
            </div>
          </div>
          <TextField label="タイトル" value={form.title} onChange={v => setForm({ ...form, title: v })} required placeholder="例：査定時の付属品の扱いについて" />
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">質問内容</label>
            <textarea
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
              rows={5}
              required
              placeholder="具体的な状況や困っていることを書いてください"
              className="w-full resize-y rounded-xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </Modal>
    </>
  )
}
