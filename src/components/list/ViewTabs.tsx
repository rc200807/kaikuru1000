'use client'

// 保存ビュータブ。プリセット＋ユーザー保存のフィルタセットを切り替える。
import { useState } from 'react'

export type ListView = {
  id: string
  name: string
  /** 一覧APIクエリ文字列（例: "types=regular&lastVisit=over90"） */
  filters: string
  /** 表示列（保存ビューのみ） */
  columns?: string[] | null
  preset?: boolean
}

type Props = {
  views: ListView[]
  activeId: string | null
  /** アクティブビューの条件から変更が加えられているか */
  dirty: boolean
  onSelect: (view: ListView) => void
  onSaveCurrent: (name: string) => Promise<void>
  onDelete: (view: ListView) => void
}

export default function ViewTabs({ views, activeId, dirty, onSelect, onSaveCurrent, onDelete }: Props) {
  const [saving, setSaving] = useState(false)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState('')

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSaveCurrent(name.trim())
      setShowNameInput(false)
      setName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-[var(--md-sys-color-outline-variant)] mb-4 -mx-1 px-1">
      {views.map(v => {
        const active = v.id === activeId
        return (
          <div key={v.id} className="relative flex-none group">
            <button
              type="button"
              onClick={() => onSelect(v)}
              className={`px-4 h-9 text-[13px] font-medium rounded-t-lg whitespace-nowrap transition-colors border border-b-0 ${
                active
                  ? 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] font-bold'
                  : 'border-transparent text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)]'
              }`}
            >
              {v.name}
              {active && dirty && <span className="ml-1 text-[var(--portal-primary,#374151)]" title="条件が変更されています">•</span>}
              {!v.preset && (
                <span
                  role="button"
                  aria-label={`ビュー「${v.name}」を削除`}
                  onClick={(e) => { e.stopPropagation(); onDelete(v) }}
                  className="ml-1.5 text-[var(--md-sys-color-on-surface-variant)] opacity-0 group-hover:opacity-70 hover:!opacity-100 font-bold"
                >
                  ×
                </span>
              )}
            </button>
          </div>
        )
      })}

      {/* 現在の条件をビューとして保存 */}
      <div className="relative flex-none">
        {showNameInput ? (
          <div className="flex items-center gap-1.5 px-2 pb-1">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowNameInput(false) }}
              placeholder="ビュー名"
              maxLength={30}
              className="h-8 w-36 px-2.5 text-xs rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="h-8 px-3 text-xs font-bold rounded-lg bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] disabled:opacity-50"
            >
              {saving ? '保存中' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => setShowNameInput(false)}
              className="h-8 px-2 text-xs text-[var(--md-sys-color-on-surface-variant)]"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNameInput(true)}
            className="px-3 h-9 text-[13px] font-medium whitespace-nowrap text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-low)] rounded-t-lg"
          >
            ＋ ビューを保存
          </button>
        )}
      </div>
    </div>
  )
}
