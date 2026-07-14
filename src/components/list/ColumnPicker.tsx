'use client'

// 「列を編集」ポップオーバー。表示列の切り替えと並び順の変更。
import { useState, useRef, useEffect } from 'react'

export type ColumnOption = { key: string; label: string }

type Props = {
  options: ColumnOption[]
  /** 表示中の列キー（表示順） */
  visible: string[]
  onChange: (visible: string[]) => void
}

export default function ColumnPicker({ options, visible, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(key: string) {
    if (visible.includes(key)) {
      if (visible.length <= 1) return // 最低1列は残す
      onChange(visible.filter(k => k !== key))
    } else {
      // options の定義順に挿入
      const next = options.map(o => o.key).filter(k => visible.includes(k) || k === key)
      onChange(next)
    }
  }

  function move(key: string, dir: -1 | 1) {
    const idx = visible.indexOf(key)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= visible.length) return
    const next = [...visible]
    next.splice(idx, 1)
    next.splice(to, 0, key)
    onChange(next)
  }

  // 表示中（順序どおり）→ 非表示の順に並べる
  const ordered = [
    ...visible.map(k => options.find(o => o.key === k)).filter(Boolean) as ColumnOption[],
    ...options.filter(o => !visible.includes(o.key)),
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" d="M9 4v16M15 4v16M4 4h16v16H4z" />
        </svg>
        列を編集
      </button>
      {open && (
        <div className="absolute z-40 top-full right-0 mt-1.5 w-60 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-lg p-1.5">
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] px-2.5 pt-1.5 pb-1">表示する列と並び順</p>
          {ordered.map(opt => {
            const isVisible = visible.includes(opt.key)
            const idx = visible.indexOf(opt.key)
            return (
              <div
                key={opt.key}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
              >
                <input
                  type="checkbox"
                  id={`col-${opt.key}`}
                  checked={isVisible}
                  onChange={() => toggle(opt.key)}
                  className="w-4 h-4 accent-[var(--portal-primary,#374151)]"
                />
                <label htmlFor={`col-${opt.key}`} className="flex-1 cursor-pointer">{opt.label}</label>
                {isVisible && (
                  <span className="flex gap-0.5">
                    <button
                      type="button"
                      aria-label="上へ"
                      disabled={idx === 0}
                      onClick={() => move(opt.key, -1)}
                      className="w-6 h-6 rounded text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-30"
                    >↑</button>
                    <button
                      type="button"
                      aria-label="下へ"
                      disabled={idx === visible.length - 1}
                      onClick={() => move(opt.key, 1)}
                      className="w-6 h-6 rounded text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-30"
                    >↓</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
