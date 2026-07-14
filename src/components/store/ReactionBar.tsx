'use client'

import { useState } from 'react'

type Reaction = { emoji: string; count: number; reacted: boolean }

/** 絵文字リアクションのバー（チップ＋追加ピッカー）。店舗ポータル用（ライトテーマ） */
export default function ReactionBar({
  reactions,
  emojiSet,
  onToggle,
  size = 'md',
}: {
  reactions: Reaction[]
  emojiSet: string[]
  onToggle: (emoji: string) => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'

  return (
    <div className="flex items-center flex-wrap gap-1.5 relative">
      {reactions.filter(r => r.count > 0).map(r => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border transition-colors ${pad} ${
            r.reacted
              ? 'border-[var(--store-primary)] bg-[var(--store-primary-container)] text-[var(--store-primary)]'
              : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]'
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold">{r.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={`inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] ${pad}`}
          title="リアクション"
        >
          <span>🙂</span><span>+</span>
        </button>
        {open && (
          <div className="absolute z-20 bottom-full mb-1 left-0 flex gap-1 p-1.5 rounded-xl bg-[var(--md-sys-color-surface-container-highest)] shadow-lg border border-[var(--md-sys-color-outline-variant)]">
            {emojiSet.map(e => (
              <button
                key={e}
                type="button"
                onMouseDown={(ev) => { ev.preventDefault(); onToggle(e); setOpen(false) }}
                className="text-xl leading-none p-1 hover:scale-110 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
