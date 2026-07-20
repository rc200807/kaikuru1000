'use client'

// ② AIデータチャット: 右下フローティングボタン + スライドオーバーパネル。
// 自然言語質問 → AIがデータを取得して回答。フィルタ適用アクション（D2）にも対応。
import { useState, useRef, useEffect } from 'react'
import type { ChatMessageItem, ChatResult } from '@/lib/analytics/types'
import { SparkleIcon } from './aiShared'

type DisplayMessage = ChatMessageItem & { usedData?: string[]; appliedFilters?: Record<string, string> | null }

const SUGGESTIONS = [
  '今月の業績を要約して',
  '成約率が低い店舗はどこ？',
  '最近多い問い合わせ内容は？',
  '買取金額が伸びている流入経路は？',
]

type Props = {
  currentQuery: string
  onApplyFilters: (filters: Record<string, string>) => void
}

export default function AiChatPanel({ currentQuery, onApplyFilters }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || loading) return
    setInput('')
    setError(null)
    const history: ChatMessageItem[] = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)
    try {
      const res = await fetch('/api/admin/analytics/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, currentParams: Object.fromEntries(new URLSearchParams(currentQuery)) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      const result = json.content as ChatResult
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        usedData: result.usedData,
        appliedFilters: result.appliedFilters,
      }])
      if (result.appliedFilters) onApplyFilters(result.appliedFilters)
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* フローティングボタン */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-40 w-13 h-13 p-3.5 rounded-full shadow-lg flex items-center justify-center bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90"
        title="AIに質問"
      >
        <SparkleIcon className="w-6 h-6" />
      </button>

      {/* スライドオーバーパネル */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[min(400px,calc(100vw-40px))] h-[min(560px,calc(100vh-140px))] rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)]">
            <span className="text-[var(--md-sys-color-primary,#4f8ef7)]"><SparkleIcon /></span>
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">AIアシスタント</h3>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">データに自然言語で質問できます</p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-lg leading-none px-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]">×</button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">例えばこんな質問ができます:</p>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full text-left text-xs px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)]'
                      : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface)]'
                  }`}
                >
                  {m.content}
                  {m.role === 'assistant' && (m.usedData?.length || m.appliedFilters) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(m.usedData ?? []).map((d, j) => (
                        <span key={j} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)]">
                          📊 {d}
                        </span>
                      ))}
                      {m.appliedFilters && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(79,142,247,0.12)] text-[#4f8ef7]">
                          ⚡ 画面のフィルタを適用しました
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3.5 py-2.5 text-xs bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)] animate-pulse">
                  データを調べています…
                </div>
              </div>
            )}
            {error && <p className="text-[11px] text-[var(--md-sys-color-error,#dc2626)]">⚠ {error}</p>}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); send(input) }}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--md-sys-color-outline-variant)]"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="データについて質問…"
              className="flex-1 text-xs px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary,#4f8ef7)]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="text-xs px-3.5 py-2 rounded-xl font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] disabled:opacity-40"
            >
              送信
            </button>
          </form>
        </div>
      )}
    </>
  )
}
