'use client'

// AI分析UIの共通部品: 生成フック・重要度スタイル・アイテムリスト表示
import { useState, useCallback } from 'react'
import type { AiInsightItem, AiSeverity } from '@/lib/analytics/types'

export const SEVERITY_STYLE: Record<AiSeverity, { bg: string; fg: string; icon: string }> = {
  good: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e', icon: '↑' },
  warn: { bg: 'rgba(251,191,36,0.12)', fg: '#d97706', icon: '!' },
  bad:  { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', icon: '↓' },
  info: { bg: 'rgba(79,142,247,0.12)', fg: '#4f8ef7', icon: '→' },
}

export function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  )
}

/** AI生成APIへのPOSTフック（generate(force)で実行） */
export function useAiPost<T>(endpoint: string) {
  const [content, setContent] = useState<T | null>(null)
  const [meta, setMeta] = useState<{ cached: boolean; generatedAt: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (body: Record<string, unknown>, force = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setContent(json.content as T)
      setMeta({ cached: json.cached === true, generatedAt: json.generatedAt })
      return json.content as T
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI生成に失敗しました')
      return null
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  const reset = useCallback(() => { setContent(null); setMeta(null); setError(null) }, [])

  return { content, meta, loading, error, generate, reset }
}

/** severity付きアイテムのリスト表示 */
export function AiItemList({ items }: { items: AiInsightItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const style = SEVERITY_STYLE[item.severity ?? 'info']
        return (
          <div key={i} className="flex gap-2.5">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold flex-shrink-0 mt-0.5"
              style={{ background: style.bg, color: style.fg }}
            >
              {style.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">{item.title}</p>
              {item.detail && <p className="text-[11px] mt-0.5 leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{item.detail}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 生成日時 + 再生成ボタンのフッター */
export function AiResultFooter({ meta, loading, onRegenerate }: {
  meta: { cached: boolean; generatedAt: string } | null
  loading: boolean
  onRegenerate: () => void
}) {
  if (!meta) return null
  const dt = new Date(meta.generatedAt)
  return (
    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--md-sys-color-outline-variant)]">
      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
        {dt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 生成
        {meta.cached ? '（キャッシュ）' : ''}
      </span>
      <button
        onClick={onRegenerate}
        disabled={loading}
        className="ml-auto text-[10px] px-2 py-1 rounded-md text-[var(--md-sys-color-primary,#4f8ef7)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] disabled:opacity-50"
      >
        再生成
      </button>
    </div>
  )
}

/** AI生成中のスケルトン */
export function AiLoadingSkeleton({ label = 'AIが分析しています…' }: { label?: string }) {
  return (
    <div className="py-4 space-y-2.5 animate-pulse">
      <p className="text-xs text-[var(--md-sys-color-primary,#4f8ef7)] flex items-center gap-1.5">
        <SparkleIcon className="w-3.5 h-3.5" />{label}
      </p>
      <div className="h-3 rounded bg-[var(--md-sys-color-surface-container-high,#eee)] w-3/4" />
      <div className="h-3 rounded bg-[var(--md-sys-color-surface-container-high,#eee)] w-full" />
      <div className="h-3 rounded bg-[var(--md-sys-color-surface-container-high,#eee)] w-2/3" />
    </div>
  )
}

export function AiErrorNote({ message }: { message: string }) {
  return <p className="text-[11px] py-2 text-[var(--md-sys-color-error,#dc2626)]">⚠ {message}</p>
}

/** APIクエリ文字列 → paramsオブジェクト */
export function queryToParams(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query))
}
