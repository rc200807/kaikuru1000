'use client'

import { useState, useRef, useEffect } from 'react'

export type CellEditorType = 'text' | 'select' | 'date' | 'postal'

type Props = {
  storeId: string
  field: string
  editor: CellEditorType
  options?: { value: string; label: string }[]
  /** 正規化済みの表示値（dirty があれば dirty、なければ元値。null は '' に寄せる） */
  value: string
  dirty: boolean
  editing: boolean
  readOnly?: boolean
  onStartEdit: (storeId: string, field: string) => void
  onEndEdit: () => void
  /** 変更確定。postal は複数フィールドを一度に積むことがある */
  onCommit: (storeId: string, changes: Record<string, string>) => void
  /** dirty セルの個別取り消し */
  onRevert: (storeId: string, field: string) => void
}

export default function BulkEditCell({
  storeId, field, editor, options, value, dirty, editing, readOnly,
  onStartEdit, onEndEdit, onCommit, onRevert,
}: Props) {
  // 編集中の下書き値はセル内ローカル state（タイプごとにグリッド全体を再レンダリングさせない）
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // postal 補完の多重実行防止
  const lookupBusy = useRef(false)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      // オートフォーカス（select は開いた直後にフォーカスのみ）
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
        selectRef.current?.focus()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function commitDraft(next?: string) {
    const v = (next ?? draft).trim()
    onCommit(storeId, { [field]: v })
    onEndEdit()
  }

  function cancel() {
    onEndEdit()
  }

  // 郵便番号: 7桁そろった時点で住所を自動補完し、3フィールドまとめてコミット
  async function handlePostalInput(v: string) {
    // 数字とハイフン以外は除去
    const cleanedInput = v.replace(/[^0-9-]/g, '')
    setDraft(cleanedInput)
    const digits = cleanedInput.replace(/[^0-9]/g, '')
    if (digits.length !== 7 || lookupBusy.current) return
    lookupBusy.current = true
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${digits}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.prefecture) return
      const addr = data.address || `${data.prefecture}${data.city || ''}${data.town || ''}`
      // 郵便番号 + 都道府県 + 住所 をまとめて dirty に積んで編集終了
      onCommit(storeId, { postalCode: cleanedInput, prefecture: data.prefecture, address: addr })
      onEndEdit()
    } catch {
      /* 失敗時は編集継続（blur/Enter で郵便番号のみコミット） */
    } finally {
      lookupBusy.current = false
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // dialog の cancel（モーダル閉）まで飛ばさない
      cancel()
    }
  }

  // ─── 編集モード ───
  if (editing && !readOnly) {
    const baseCls =
      'w-full h-8 px-2 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border-2 border-[var(--portal-primary,#374151)] rounded-[var(--md-sys-shape-extra-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none'
    if (editor === 'select') {
      return (
        <select
          ref={selectRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commitDraft()}
          onKeyDown={handleKeyDown}
          className={baseCls}
        >
          {options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }
    if (editor === 'date') {
      return (
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commitDraft()}
          onKeyDown={handleKeyDown}
          className={baseCls}
        />
      )
    }
    if (editor === 'postal') {
      return (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => handlePostalInput(e.target.value)}
          onBlur={() => commitDraft()}
          onKeyDown={handleKeyDown}
          placeholder="123-4567"
          className={baseCls}
        />
      )
    }
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commitDraft()}
        onKeyDown={handleKeyDown}
        className={baseCls}
      />
    )
  }

  // ─── 表示モード ───
  const displayLabel =
    editor === 'select' && value
      ? (options?.find(o => o.value === value)?.label ?? value)
      : value

  return (
    <div
      onDoubleClick={readOnly ? undefined : () => onStartEdit(storeId, field)}
      data-store-id={storeId}
      data-field={field}
      title={readOnly ? undefined : 'ダブルクリックで編集'}
      className={`group/cell relative h-8 flex items-center px-2 text-sm rounded-[var(--md-sys-shape-extra-small)] ${
        readOnly
          ? 'text-[var(--md-sys-color-on-surface-variant)]'
          : 'cursor-cell text-[var(--md-sys-color-on-surface)]'
      } ${
        dirty
          ? 'bg-[var(--md-sys-color-tertiary-container,#fde68a)] !text-[var(--md-sys-color-on-tertiary-container,#78350f)] font-medium'
          : readOnly ? '' : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
      }`}
    >
      <span className="truncate flex-1">
        {displayLabel || <span className="text-[var(--md-sys-color-outline)]">—</span>}
      </span>
      {dirty && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRevert(storeId, field) }}
          title="この変更を元に戻す"
          className="hidden group-hover/cell:flex items-center justify-center w-5 h-5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/10 flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
