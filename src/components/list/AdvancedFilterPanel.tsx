'use client'

// 詳細フィルター（スライドオーバー）。全フィルタ項目をAND条件で組み合わせ、
// 適用前に該当件数をプレビューできる。
import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChipOption } from './FilterChipBar'

export type AdvField =
  | { key: string; label: string; type: 'multi'; options: ChipOption[] }
  | { key: string; label: string; type: 'single'; options: ChipOption[] }
  | { key: string; label: string; type: 'daterange' }
  | { key: string; label: string; type: 'text'; placeholder?: string }

type Props = {
  open: boolean
  onClose: () => void
  fields: AdvField[]
  /** 現在適用中のフィルタ値 */
  values: Record<string, string>
  onApply: (patch: Record<string, string>) => void
  /** 件数プレビュー: draft値を受けて該当件数を返す */
  fetchCount?: (draft: Record<string, string>) => Promise<number>
  /** パネル冒頭の説明文（対象名を差し替える用途） */
  description?: string
}

/** フィールドが読み書きするクエリキー一覧 */
function fieldKeys(f: AdvField): string[] {
  return f.type === 'daterange' ? [`${f.key}From`, `${f.key}To`] : [f.key]
}

export default function AdvancedFilterPanel({ open, onClose, fields, values, onApply, fetchCount, description }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const countSeq = useRef(0)

  // 開いたときに現在値をドラフトへコピー
  useEffect(() => {
    if (!open) return
    const d: Record<string, string> = {}
    for (const f of fields) for (const k of fieldKeys(f)) d[k] = values[k] || ''
    setDraft(d)
    setCount(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ドラフト変更のたびに件数プレビュー（デバウンス）
  useEffect(() => {
    if (!open || !fetchCount) return
    const seq = ++countSeq.current
    setCounting(true)
    const handle = setTimeout(() => {
      fetchCount(draft)
        .then(n => { if (seq === countSeq.current) setCount(n) })
        .catch(() => { if (seq === countSeq.current) setCount(null) })
        .finally(() => { if (seq === countSeq.current) setCounting(false) })
    }, 350)
    return () => clearTimeout(handle)
  }, [open, draft, fetchCount])

  const patch = useCallback((kv: Record<string, string>) => {
    setDraft(prev => ({ ...prev, ...kv }))
  }, [])

  if (!open) return null

  const inputCls = 'w-full h-10 px-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#374151)]/40'

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="詳細フィルター">
      {/* 背景 */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* パネル */}
      <div className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
          <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">詳細フィルター</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {description ?? 'すべての条件に一致する顧客を表示します（AND条件）。'}
          </p>
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">{f.label}</label>
              {f.type === 'text' ? (
                <input
                  type="text"
                  value={draft[f.key] || ''}
                  onChange={e => patch({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className={inputCls}
                />
              ) : f.type === 'daterange' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={draft[`${f.key}From`] || ''}
                    onChange={e => patch({ [`${f.key}From`]: e.target.value })}
                    className={inputCls}
                    aria-label={`${f.label} 開始日`}
                  />
                  <span className="text-[var(--md-sys-color-on-surface-variant)] text-sm flex-none">〜</span>
                  <input
                    type="date"
                    value={draft[`${f.key}To`] || ''}
                    onChange={e => patch({ [`${f.key}To`]: e.target.value })}
                    className={inputCls}
                    aria-label={`${f.label} 終了日`}
                  />
                </div>
              ) : f.type === 'single' ? (
                <select
                  value={draft[f.key] || ''}
                  onChange={e => patch({ [f.key]: e.target.value })}
                  className={inputCls}
                >
                  <option value="">指定なし</option>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map(o => {
                    const selected = (draft[f.key] || '').split(',').filter(Boolean)
                    const checked = selected.includes(o.value)
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => {
                          const next = checked ? selected.filter(v => v !== o.value) : [...selected, o.value]
                          patch({ [f.key]: next.join(',') })
                        }}
                        className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                          checked
                            ? 'border-[var(--portal-primary,#374151)] bg-[color-mix(in_srgb,var(--portal-primary,#374151)_10%,transparent)] text-[var(--md-sys-color-on-surface)]'
                            : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--portal-primary,#374151)]'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-[var(--md-sys-color-outline-variant)]">
          <button
            type="button"
            onClick={() => {
              const cleared: Record<string, string> = {}
              for (const f of fields) for (const k of fieldKeys(f)) cleared[k] = ''
              setDraft(cleared)
            }}
            className="h-10 px-4 rounded-lg text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            条件をクリア
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => { onApply(draft); onClose() }}
            className="h-10 px-5 rounded-lg text-sm font-bold bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90"
          >
            適用{fetchCount ? `（${counting ? '…' : count !== null ? `${count.toLocaleString()}件` : '—'}）` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
