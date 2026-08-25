'use client'

// ナレッジベースAIチャット。管理ポータル・店舗ポータルの両方で同じものを使う。
// ポータルごとに違うのは「APIのパス」と「アクセント色」だけなので props で受ける
// （店舗ポータルには --md-sys-color-primary が存在しないため、色を外から渡す必要がある）。
import { useState, useRef, useEffect, useCallback } from 'react'

type UsedFaq = { id: string; question: string }

type Message = {
  role: 'user' | 'assistant'
  content: string
  usedFaqs?: UsedFaq[]
  answered?: boolean
}

type ApiMessage = {
  role: 'user' | 'assistant'
  content: string
  usedFaqs?: UsedFaq[]
  answered?: boolean
}

type Props = {
  /** 例: /api/store/knowledge/chat */
  endpoint: string
  /** 送信ボタン・自分の吹き出しの背景色。店舗は var(--store-primary) */
  accent: string
  /**
   * accent の上に載せる文字色。
   * 管理ポータルの --portal-primary は白のため、白文字だと読めなくなる。
   * 必ずポータルの on-primary を渡すこと。
   */
  accentText: string
  /** 空状態で提示する質問例 */
  suggestions?: string[]
  /** チャット領域の高さ（既定は画面に収まる固定高） */
  height?: string
}

const DEFAULT_SUGGESTIONS = [
  '買取の流れを教えて',
  '身分証はどれが使えますか？',
  'キャンセルはできますか？',
]

export default function KnowledgeChat({
  endpoint,
  accent,
  accentText,
  suggestions = DEFAULT_SUGGESTIONS,
  height = 'min(620px, calc(100vh - 260px))',
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 保存されている直近の会話を復元する
  useEffect(() => {
    let cancelled = false
    fetch(endpoint)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then((data: { messages?: ApiMessage[] }) => {
        if (cancelled) return
        const restored = (data.messages ?? []).map(m => ({
          role: m.role,
          content: m.content,
          answered: m.answered,
          usedFaqs: m.usedFaqs ?? [],
        }))
        setMessages(restored)
      })
      .catch(() => { /* 復元できなくても新規の会話として続行 */ })
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  }, [endpoint])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  const send = useCallback(async (text: string) => {
    const question = text.trim()
    if (!question || loading) return
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? '回答の取得に失敗しました')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: json.answer,
        usedFaqs: json.usedFaqs ?? [],
        answered: json.answered,
      }])
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [endpoint, loading])

  async function startNew() {
    if (loading) return
    setError(null)
    setMessages([])
    try {
      await fetch(endpoint, { method: 'DELETE' })
    } catch {
      /* 表示は既にリセット済みなので、失敗しても操作は継続できる */
    }
  }

  return (
    <div
      className="flex flex-col rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-hidden"
      style={{ height }}
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--md-sys-color-outline-variant)]">
        <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">ナレッジベースに質問</span>
        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          登録されたFAQ・資料を元に回答します
        </span>
        {messages.length > 0 && (
          <button
            onClick={startNew}
            disabled={loading}
            className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-40"
          >
            新しい会話を始める
          </button>
        )}
      </div>

      {/* 会話 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {restoring ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
        ) : messages.length === 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              例えばこんな質問ができます:
            </p>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left text-sm px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={
                m.role === 'user'
                  ? { background: accent, color: accentText }
                  : { background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }
              }
            >
              {m.content}
              {m.role === 'assistant' && (m.usedFaqs?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] w-full">参照した情報源</span>
                  {m.usedFaqs!.map(f => (
                    <span
                      key={f.id}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)]"
                    >
                      {f.question}
                    </span>
                  ))}
                </div>
              )}
              {m.role === 'assistant' && m.answered === false && (
                <div className="mt-2 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  この質問は記録され、ナレッジベースの改善に使われます
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] animate-pulse">
              回答を作成しています…
            </div>
          </div>
        )}
        {error && <p className="text-xs text-[var(--md-sys-color-error)]">⚠ {error}</p>}
      </div>

      {/* 入力 */}
      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--md-sys-color-outline-variant)]"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="質問を入力してください…"
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] outline-none focus:border-[var(--md-sys-color-outline)]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-40"
          style={{ background: accent, color: accentText }}
        >
          送信
        </button>
      </form>
    </div>
  )
}
