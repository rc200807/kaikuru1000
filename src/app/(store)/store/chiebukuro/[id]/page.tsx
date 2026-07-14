'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import ReactionBar from '@/components/store/ReactionBar'
import { categoryIcon, QUESTION_EMOJIS, ANSWER_EMOJIS } from '@/lib/chiebukuro'

type Reaction = { emoji: string; count: number; reacted: boolean }
type Answer = { id: string; body: string; authorName: string; isBest: boolean; mine: boolean; createdAt: string; reactions: Reaction[] }
type QuestionDetail = {
  id: string; title: string; body: string; category: string; authorName: string
  isResolved: boolean; isOwner: boolean; createdAt: string
  reactions: Reaction[]; answers: Answer[]
}

export default function ChiebukuroDetailPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const qid = params.id as string
  const [q, setQ] = useState<QuestionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [answer, setAnswer] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => { if (status === 'unauthenticated') router.push('/store/login') }, [status, router])

  const load = useCallback(async () => {
    const r = await fetch(`/api/store/chiebukuro/questions/${qid}`)
    if (!r.ok) { setNotFound(true); setLoading(false); return }
    setQ(await r.json())
    setLoading(false)
  }, [qid])

  useEffect(() => { if (status === 'authenticated') load() }, [status, load])

  const toggleQuestionReaction = async (emoji: string) => {
    await fetch(`/api/store/chiebukuro/questions/${qid}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) })
    load()
  }
  const toggleAnswerReaction = async (answerId: string, emoji: string) => {
    await fetch(`/api/store/chiebukuro/answers/${answerId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) })
    load()
  }
  const toggleBest = async (answerId: string) => {
    await fetch(`/api/store/chiebukuro/answers/${answerId}/best`, { method: 'POST' })
    load()
  }
  const postAnswer = async () => {
    const t = answer.trim()
    if (!t || posting) return
    setPosting(true)
    try {
      const r = await fetch(`/api/store/chiebukuro/questions/${qid}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: t }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '投稿に失敗しました') }
      setAnswer('')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '投稿に失敗しました')
    } finally {
      setPosting(false)
    }
  }

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />
  if (notFound || !q) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 text-center">
        <p className="text-[var(--md-sys-color-on-surface-variant)] mb-4">質問が見つかりません</p>
        <Link href="/store/chiebukuro" className="text-sm text-[var(--store-primary)] hover:underline">知恵袋に戻る</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link href="/store/chiebukuro" className="inline-flex items-center gap-1.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--store-primary)] mb-5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        知恵袋
      </Link>

      {/* 質問 */}
      <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">{categoryIcon(q.category)} {q.category}</span>
          {q.isResolved && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">解決済み</span>}
        </div>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] mb-2">{q.title}</h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap break-words">{q.body}</p>
        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-3">
          {q.authorName}・{format(new Date(q.createdAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
        </div>
        <div className="mt-3">
          <ReactionBar reactions={q.reactions} emojiSet={QUESTION_EMOJIS} onToggle={toggleQuestionReaction} size="sm" />
        </div>
      </div>

      {/* 回答 */}
      <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mt-8 mb-3">回答（{q.answers.length}）</h2>
      <div className="space-y-3">
        {q.answers.length === 0 && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">まだ回答はありません。最初の回答を書いてみましょう。</p>
        )}
        {q.answers.map(a => (
          <div
            key={a.id}
            className={`rounded-2xl border p-4 ${a.isBest ? 'border-green-500 bg-green-50/60' : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]'}`}
          >
            {a.isBest && (
              <div className="flex items-center gap-1.5 text-green-700 text-xs font-bold mb-2">
                <span>⭐</span> ベストアンサー
              </div>
            )}
            <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap break-words">{a.body}</p>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-2">
              {a.authorName}・{format(new Date(a.createdAt), 'M月d日 HH:mm', { locale: ja })}
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <ReactionBar reactions={a.reactions} emojiSet={ANSWER_EMOJIS} onToggle={(e) => toggleAnswerReaction(a.id, e)} size="sm" />
              {q.isOwner && (
                <button
                  type="button"
                  onClick={() => toggleBest(a.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${a.isBest ? 'border-green-500 text-green-700' : 'border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
                >
                  {a.isBest ? 'ベストアンサー解除' : 'ベストアンサーにする'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 回答フォーム */}
      <div className="mt-6 pt-5 border-t border-[var(--md-sys-color-outline-variant)]">
        <label className="block text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-2">回答を書く</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          rows={4}
          placeholder="あなたの知見を回答しましょう"
          className="w-full resize-y rounded-xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] px-3 py-2 text-sm"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={postAnswer}
            disabled={posting || !answer.trim()}
            className="px-5 py-2 rounded-xl bg-[var(--store-primary)] text-white text-sm font-semibold disabled:opacity-40"
          >
            {posting ? '投稿中…' : '回答する'}
          </button>
        </div>
      </div>
    </div>
  )
}
