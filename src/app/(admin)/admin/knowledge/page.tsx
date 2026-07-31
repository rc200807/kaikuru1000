'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import DataTable, { type Column } from '@/components/DataTable'
import TextField from '@/components/TextField'
import KnowledgeChat from '@/components/knowledge/KnowledgeChat'
import { faqHtmlToText } from '@/lib/faq-sanitize'
import {
  FAQ_VISIBILITIES, FAQ_VISIBILITY_COLOR, faqVisibilityLabel,
  KNOWLEDGE_QUERY_STATUSES, knowledgeQueryStatusLabel,
  FAQ_CATEGORY_COLORS,
} from '@/lib/knowledge'

// RichTextEditor は SSR 不可（announcements と同じ読み込み方）
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

type Tab = 'faqs' | 'categories' | 'gaps' | 'chat'

type Category = {
  id: string
  name: string
  color: string
  sortOrder: number
  isActive: boolean
  _count: { faqs: number }
}

type Faq = {
  id: string
  question: string
  answer: string
  visibility: string
  isPublished: boolean
  categoryId: string | null
  category: { id: string; name: string; color: string } | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

type Query = {
  id: string
  question: string
  answered: boolean
  status: string
  viewerType: string
  storeName: string | null
  createdAt: string
}

type FaqForm = {
  question: string
  answer: string
  categoryId: string
  visibility: string
  isPublished: boolean
}

const emptyFaqForm = (): FaqForm => ({
  question: '', answer: '', categoryId: '', visibility: 'all', isPublished: true,
})

const controlBase =
  'h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2'
const inputCls = `w-full ${controlBase}`

function VisibilityBadge({ value }: { value: string }) {
  const c = FAQ_VISIBILITY_COLOR[value as keyof typeof FAQ_VISIBILITY_COLOR]
    ?? { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' }
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {faqVisibilityLabel(value)}
    </span>
  )
}

export default function KnowledgePage() {
  const { status: sessionStatus } = useSession()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('faqs')
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [queries, setQueries] = useState<Query[]>([])
  const [openGapCount, setOpenGapCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // FAQ の絞り込み
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [visFilter, setVisFilter] = useState('')
  const [pubFilter, setPubFilter] = useState('')

  // FAQ の登録・編集
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Faq | null>(null)
  const [form, setForm] = useState<FaqForm>(emptyFaqForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [detail, setDetail] = useState<Faq | null>(null)
  const [deleting, setDeleting] = useState<Faq | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // カテゴリー
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState<string>(FAQ_CATEGORY_COLORS[0])
  const [catBusy, setCatBusy] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [catConfirm, setCatConfirm] = useState<{ cat: Category; referenceCount: number; message: string } | null>(null)

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/admin/login')
  }, [sessionStatus, router])

  // URLの ?tab= と表示タブを同期（announcements と同じ流儀）
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'categories' || t === 'gaps' || t === 'chat') setTab(t)
  }, [])

  function switchTab(next: Tab) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'faqs') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.pushState({}, '', url)
  }

  const loadFaqs = useCallback(() => fetch('/api/admin/knowledge/faqs')
    .then(r => (r.ok ? r.json() : []))
    .then(d => setFaqs(Array.isArray(d) ? d : [])), [])

  const loadCategories = useCallback(() => fetch('/api/admin/knowledge/categories')
    .then(r => (r.ok ? r.json() : []))
    .then(d => setCategories(Array.isArray(d) ? d : [])), [])

  const loadQueries = useCallback(() => fetch('/api/admin/knowledge/queries')
    .then(r => (r.ok ? r.json() : { queries: [], openCount: 0 }))
    .then(d => { setQueries(d.queries ?? []); setOpenGapCount(d.openCount ?? 0) }), [])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    Promise.all([loadFaqs(), loadCategories(), loadQueries()]).finally(() => setLoading(false))
  }, [sessionStatus, loadFaqs, loadCategories, loadQueries])

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return faqs.filter(f => {
      if (catFilter && f.categoryId !== catFilter) return false
      if (visFilter && f.visibility !== visFilter) return false
      if (pubFilter === 'published' && !f.isPublished) return false
      if (pubFilter === 'draft' && f.isPublished) return false
      if (!q) return true
      return [f.question, faqHtmlToText(f.answer), f.category?.name ?? ''].join(' ').toLowerCase().includes(q)
    })
  }, [faqs, search, catFilter, visFilter, pubFilter])

  // ─── FAQ 操作 ───────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm(emptyFaqForm())
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(f: Faq) {
    setEditing(f)
    setForm({
      question: f.question,
      answer: f.answer,
      categoryId: f.categoryId ?? '',
      visibility: f.visibility,
      isPublished: f.isPublished,
    })
    setFormError('')
    setDetail(null)
    setFormOpen(true)
  }

  async function saveFaq() {
    if (!form.question.trim()) { setFormError('質問を入力してください'); return }
    if (!form.answer.trim()) { setFormError('回答を入力してください'); return }
    setSaving(true)
    setFormError('')
    try {
      const url = editing ? `/api/admin/knowledge/faqs/${editing.id}` : '/api/admin/knowledge/faqs'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, categoryId: form.categoryId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error || '保存に失敗しました'); return }
      setFormOpen(false)
      setMessage({ type: 'success', text: editing ? 'FAQを更新しました' : 'FAQを登録しました' })
      await Promise.all([loadFaqs(), loadCategories()])
    } catch {
      setFormError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFaq() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/admin/knowledge/faqs/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
        return
      }
      setDeleting(null)
      setDetail(null)
      setMessage({ type: 'success', text: 'FAQを削除しました' })
      await Promise.all([loadFaqs(), loadCategories()])
    } finally {
      setDeleteBusy(false)
    }
  }

  // ─── カテゴリー操作 ─────────────────────────────────

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCatBusy(true)
    try {
      const res = await fetch('/api/admin/knowledge/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ type: 'error', text: data.error || '追加に失敗しました' }); return }
      setNewCatName('')
      await loadCategories()
    } finally {
      setCatBusy(false)
    }
  }

  async function patchCategory(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/knowledge/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
      return false
    }
    await loadCategories()
    return true
  }

  async function removeCategory(cat: Category, force = false) {
    const res = await fetch(`/api/admin/knowledge/categories/${cat.id}${force ? '?force=1' : ''}`, { method: 'DELETE' })
    if (res.status === 409) {
      const data = await res.json()
      setCatConfirm({ cat, referenceCount: data.referenceCount, message: data.message })
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
      return
    }
    setCatConfirm(null)
    setMessage({ type: 'success', text: `カテゴリー「${cat.name}」を削除しました` })
    await Promise.all([loadCategories(), loadFaqs()])
  }

  function persistOrder(ordered: Category[]) {
    fetch('/api/admin/knowledge/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map(c => c.id) }),
    }).catch(() => {})
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return }
    setCategories(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      persistOrder(next)
      return next
    })
    setDragIndex(null)
  }

  // ─── 未回答の質問 ───────────────────────────────────

  async function setQueryStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/knowledge/queries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      setMessage({ type: 'error', text: '対応状況の更新に失敗しました' })
      return
    }
    await loadQueries()
  }

  /** 未回答の質問から、その質問文をそのまま入れてFAQ登録を開く */
  function createFaqFromQuery(q: Query) {
    setEditing(null)
    setForm({ ...emptyFaqForm(), question: q.question })
    setFormError('')
    switchTab('faqs')
    setFormOpen(true)
  }

  const faqColumns: Column<Faq>[] = [
    {
      key: 'question', header: '質問',
      render: (f) => (
        <div className="min-w-0">
          <div className="text-sm font-medium">{f.question}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-1">
            {faqHtmlToText(f.answer)}
          </div>
        </div>
      ),
    },
    {
      key: 'category', header: 'カテゴリー',
      render: (f) => f.category ? (
        <span
          className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-white"
          style={{ background: f.category.color }}
        >
          {f.category.name}
        </span>
      ) : <span className="text-xs text-[var(--md-sys-color-outline)]">未分類</span>,
    },
    { key: 'visibility', header: '公開範囲', render: (f) => <VisibilityBadge value={f.visibility} /> },
    {
      key: 'isPublished', header: '状態',
      render: (f) => (
        <span className={`text-xs whitespace-nowrap ${f.isPublished ? '' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
          {f.isPublished ? '公開' : '下書き'}
        </span>
      ),
    },
    {
      key: 'updatedAt', header: '更新日',
      render: (f) => <span className="text-xs whitespace-nowrap">{new Date(f.updatedAt).toLocaleDateString('ja-JP')}</span>,
    },
  ]

  if (sessionStatus === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'faqs', label: `FAQ（${faqs.length}）` },
    { key: 'categories', label: `カテゴリー（${categories.length}）` },
    { key: 'gaps', label: '未回答の質問', badge: openGapCount },
    { key: 'chat', label: 'AIに聞く' },
  ]

  return (
    <>
      <AppBar
        title="ナレッジベース"
        actions={tab === 'faqs' ? (
          <Button
            size="sm"
            onClick={openCreate}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            FAQを登録
          </Button>
        ) : undefined}
      />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {/* タブ */}
        <div className="flex gap-1 mb-5 border-b border-[var(--md-sys-color-outline-variant)] flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`relative px-4 py-2.5 text-sm font-medium -mb-px border-b-2 ${
                tab === t.key
                  ? 'border-[var(--portal-primary,#374151)] text-[var(--md-sys-color-on-surface)]'
                  : 'border-transparent text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-error)] text-white">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── FAQ タブ ─── */}
        {tab === 'faqs' && (
          <>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="質問・回答・カテゴリーで検索..."
                  className={`${inputCls} pl-9`}
                />
              </div>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={controlBase}>
                <option value="">すべてのカテゴリー</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={visFilter} onChange={e => setVisFilter(e.target.value)} className={controlBase}>
                <option value="">すべての公開範囲</option>
                {FAQ_VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <select value={pubFilter} onChange={e => setPubFilter(e.target.value)} className={controlBase}>
                <option value="">公開・下書きすべて</option>
                <option value="published">公開のみ</option>
                <option value="draft">下書きのみ</option>
              </select>
            </div>

            <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden mb-8">
              <DataTable<Faq>
                columns={faqColumns}
                data={filteredFaqs}
                rowKey={(f) => f.id}
                emptyTitle={faqs.length === 0 ? 'FAQがまだ登録されていません' : '条件に一致するFAQがありません'}
                emptyDescription={faqs.length === 0 ? '「FAQを登録」から質問と回答を追加してください。登録した内容はAIチャットの回答根拠になります。' : undefined}
                onRowClick={(f) => setDetail(f)}
              />
            </div>
          </>
        )}

        {/* ─── カテゴリー タブ ─── */}
        {tab === 'categories' && (
          <div className="max-w-2xl space-y-5">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              ⠿ の行をドラッグして並べ替えると、FAQ一覧やカテゴリー選択の表示順に反映されます。
            </p>

            <div className="space-y-1">
              {categories.length === 0 ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-6 text-center">
                  カテゴリーがまだありません
                </p>
              ) : categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  draggable={editingCatId === null}
                  onDragStart={() => editingCatId === null && setDragIndex(idx)}
                  onDragOver={e => { if (editingCatId === null) e.preventDefault() }}
                  onDrop={() => editingCatId === null && handleDrop(idx)}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-3 py-2 px-3 rounded-[var(--md-sys-shape-small)] ${
                    dragIndex === idx
                      ? 'bg-[var(--md-sys-color-surface-container-high)]'
                      : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
                  } ${!cat.isActive ? 'opacity-50' : ''}`}
                >
                  <span
                    className="text-[var(--md-sys-color-on-surface-variant)] select-none flex-shrink-0"
                    style={{ cursor: editingCatId === null ? 'grab' : 'default' }}
                    aria-hidden="true"
                  >
                    ⠿
                  </span>

                  <input
                    type="color"
                    value={cat.color}
                    onChange={e => patchCategory(cat.id, { color: e.target.value })}
                    className="w-7 h-7 rounded border border-[var(--md-sys-color-outline-variant)] bg-transparent cursor-pointer flex-shrink-0"
                    aria-label={`${cat.name} の色`}
                  />

                  {editingCatId === cat.id ? (
                    <form
                      onSubmit={async e => {
                        e.preventDefault()
                        if (!editCatName.trim()) return
                        if (await patchCategory(cat.id, { name: editCatName.trim() })) setEditingCatId(null)
                      }}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <input
                        autoFocus
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingCatId(null) }}
                        className={`${inputCls} h-9`}
                      />
                      <Button size="sm" type="submit">保存</Button>
                      <Button size="sm" variant="text" onClick={() => setEditingCatId(null)}>取消</Button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name) }}
                        className="flex-1 min-w-0 text-left text-sm text-[var(--md-sys-color-on-surface)] hover:underline"
                        title="クリックで名前を編集"
                      >
                        {cat.name}
                      </button>
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                        FAQ {cat._count.faqs}件
                      </span>
                      <button
                        role="switch"
                        aria-checked={cat.isActive}
                        onClick={() => patchCategory(cat.id, { isActive: !cat.isActive })}
                        className={`relative w-10 h-5 rounded-full flex-shrink-0 ${cat.isActive ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline-variant)]'}`}
                        title={cat.isActive ? '有効（クリックで無効化）' : '無効（クリックで有効化）'}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cat.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                      <button
                        onClick={() => removeCategory(cat)}
                        className="text-xs text-[var(--md-sys-color-error)] px-2 flex-shrink-0 hover:underline"
                      >
                        削除
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={addCategory} className="flex items-end gap-2 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
              <div className="flex-1">
                <TextField label="カテゴリーを追加" value={newCatName} onChange={setNewCatName} placeholder="例: 買取の流れ" />
              </div>
              <div className="flex gap-1 pb-1.5">
                {FAQ_CATEGORY_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className={`w-6 h-6 rounded-full ${newCatColor === c ? 'ring-2 ring-offset-2 ring-[var(--md-sys-color-on-surface)] ring-offset-[var(--md-sys-color-surface)]' : ''}`}
                    style={{ background: c }}
                    aria-label={`色 ${c}`}
                  />
                ))}
              </div>
              <div className="pb-1.5">
                <Button type="submit" variant="tonal" loading={catBusy} disabled={catBusy || !newCatName.trim()}>追加</Button>
              </div>
            </form>
          </div>
        )}

        {/* ─── 未回答の質問 タブ ─── */}
        {tab === 'gaps' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              AIがナレッジベースから回答できなかった質問です。FAQを追加すると次回から答えられるようになります。
            </p>
            {queries.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-10 text-center">
                未回答の質問はありません
              </p>
            ) : (
              <div className="space-y-2">
                {queries.map(q => (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 p-3 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-surface-container-low)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--md-sys-color-on-surface)]">{q.question}</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                        {q.viewerType === 'store' ? `店舗${q.storeName ? `（${q.storeName}）` : ''}` : '管理ポータル'}
                        {' ・ '}
                        {new Date(q.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                        {' ・ '}
                        {knowledgeQueryStatusLabel(q.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                      <Button size="sm" variant="outlined" onClick={() => createFaqFromQuery(q)}>FAQを作る</Button>
                      <select
                        value={q.status}
                        onChange={e => setQueryStatus(q.id, e.target.value)}
                        className={`${controlBase} h-9`}
                      >
                        {KNOWLEDGE_QUERY_STATUSES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── AIに聞く タブ ─── */}
        {tab === 'chat' && (
          <div className="max-w-3xl">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
              管理者のみ公開のFAQも含めて回答します。
            </p>
            <KnowledgeChat
              endpoint="/api/admin/knowledge/chat"
              accent="var(--portal-primary, #374151)"
              accentText="var(--portal-on-primary, #ffffff)"
            />
          </div>
        )}
      </div>

      {/* ─── FAQ 登録・編集 ─── */}
      <Modal
        open={formOpen}
        onClose={() => { if (!saving) setFormOpen(false) }}
        title={editing ? 'FAQを編集' : 'FAQを登録'}
        size="xl"
      >
        <div className="space-y-4">
          {formError && <MessageBanner severity="error">{formError}</MessageBanner>}

          <label className="block">
            <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">
              質問<span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>
            </span>
            <input
              value={form.question}
              onChange={e => setForm({ ...form, question: e.target.value })}
              placeholder="例: 買取金額はどうやって決まりますか？"
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">カテゴリー</span>
              <select
                value={form.categoryId}
                onChange={e => setForm({ ...form, categoryId: e.target.value })}
                className={inputCls}
              >
                <option value="">未分類</option>
                {categories.filter(c => c.isActive || c.id === form.categoryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">
                公開範囲<span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>
              </span>
              <select
                value={form.visibility}
                onChange={e => setForm({ ...form, visibility: e.target.value })}
                className={inputCls}
              >
                {FAQ_VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">状態</span>
              <select
                value={form.isPublished ? 'published' : 'draft'}
                onChange={e => setForm({ ...form, isPublished: e.target.value === 'published' })}
                className={inputCls}
              >
                <option value="published">公開</option>
                <option value="draft">下書き（AIの参照対象外）</option>
              </select>
            </label>
          </div>

          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {FAQ_VISIBILITIES.find(v => v.value === form.visibility)?.hint}
          </p>

          <div>
            <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">
              回答<span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>
            </span>
            <RichTextEditor
              content={form.answer}
              onChange={(html: string) => setForm({ ...form, answer: html })}
              placeholder="回答を入力してください。見出し・箇条書き・リンク・画像が使えます。"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setFormOpen(false)} disabled={saving}>キャンセル</Button>
            <Button onClick={saveFaq} loading={saving} disabled={saving}>
              {editing ? '更新する' : '登録する'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── FAQ 詳細 ─── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="FAQ詳細" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <VisibilityBadge value={detail.visibility} />
              {detail.category && (
                <span
                  className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ background: detail.category.color }}
                >
                  {detail.category.name}
                </span>
              )}
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {detail.isPublished ? '公開' : '下書き'}
              </span>
            </div>

            <div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">質問</div>
              <div className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">{detail.question}</div>
            </div>

            <div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1.5">回答</div>
              <div
                className="faq-content rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)]"
                dangerouslySetInnerHTML={{ __html: detail.answer }}
              />
            </div>

            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {detail.createdBy ? `作成: ${detail.createdBy.name} ・ ` : ''}
              {new Date(detail.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
              {detail.updatedAt !== detail.createdAt && (
                <> ・ 最終更新: {new Date(detail.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="text" onClick={() => setDeleting(detail)}>削除</Button>
              <div className="flex gap-2">
                <Button variant="text" onClick={() => setDetail(null)}>閉じる</Button>
                <Button onClick={() => openEdit(detail)}>編集する</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── FAQ 削除確認 ─── */}
      <Modal open={!!deleting} onClose={() => { if (!deleteBusy) setDeleting(null) }} title="FAQを削除しますか？" size="sm">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              「{deleting.question}」を削除します。この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setDeleting(null)} disabled={deleteBusy}>キャンセル</Button>
              <Button onClick={deleteFaq} loading={deleteBusy} disabled={deleteBusy}>削除する</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── カテゴリー削除確認（FAQが紐づいている場合） ─── */}
      <Modal open={!!catConfirm} onClose={() => setCatConfirm(null)} title="カテゴリーを削除しますか？" size="sm">
        {catConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              {catConfirm.message}
              <br />
              FAQ自体は削除されません。無効化しておけば、既存のFAQの分類を保ったまま新規選択肢から外せます。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setCatConfirm(null)}>キャンセル</Button>
              <Button
                variant="outlined"
                onClick={async () => {
                  if (await patchCategory(catConfirm.cat.id, { isActive: false })) {
                    setCatConfirm(null)
                    setMessage({ type: 'success', text: `カテゴリー「${catConfirm.cat.name}」を無効化しました` })
                  }
                }}
              >
                無効化する
              </Button>
              <Button onClick={() => removeCategory(catConfirm.cat, true)}>削除する</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
