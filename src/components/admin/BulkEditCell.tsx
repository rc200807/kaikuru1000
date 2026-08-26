'use client'

import { useState, useRef, useEffect } from 'react'

export type CellEditorType = 'text' | 'select' | 'date' | 'postal'

type Props = {
  storeId: string
  field: string
  editor: CellEditorType
  options?: { value: string; label: string }[]
  /** select 用: 選択肢が多い列（運営者など）で検索ボックス付きコンボボックスにする */
  searchable?: boolean
  /** 正規化済みの表示値（dirty があれば dirty、なければ元値。null は '' に寄せる） */
  value: string
  dirty: boolean
  editing: boolean
  readOnly?: boolean
  /** 運営者から継承された読み取り専用セルに鍵アイコンを表示する */
  lockHint?: boolean
  onStartEdit: (storeId: string, field: string) => void
  onEndEdit: () => void
  /** postal 用: 補完先のフィールド名（省略時は店舗住所の3項目） */
  postalTargets?: { postalCode: string; prefecture?: string; address: string }
  /** 変更確定。postal は複数フィールドを一度に積むことがある */
  onCommit: (storeId: string, changes: Record<string, string>) => void
  /** dirty セルの個別取り消し */
  onRevert: (storeId: string, field: string) => void
}

export default function BulkEditCell({
  storeId, field, editor, options, searchable, postalTargets, value, dirty, editing, readOnly, lockHint,
  onStartEdit, onEndEdit, onCommit, onRevert,
}: Props) {
  // 編集中の下書き値はセル内ローカル state（タイプごとにグリッド全体を再レンダリングさせない）
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // postal 補完の多重実行防止
  const lookupBusy = useRef(false)

  // 検索ボックス付きコンボボックス（select + searchable）用の状態。
  // ドロップダウンはテーブルの overflow-auto に隠れないよう、行アクションメニューと同じく
  // position:fixed で入力欄の実座標に合わせて表示する（3点リーダーメニューと同じ流儀）
  const [searchQuery, setSearchQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [comboRect, setComboRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const comboWrapRef = useRef<HTMLDivElement>(null)
  const comboInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      setSearchQuery('')
      setHighlight(0)
      // オートフォーカス（select は開いた直後にフォーカスのみ）
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
        selectRef.current?.focus()
        comboInputRef.current?.focus()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (editing && searchable && comboWrapRef.current) {
      const r = comboWrapRef.current.getBoundingClientRect()
      setComboRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) })
    } else {
      setComboRect(null)
    }
  }, [editing, searchable])

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
      const t = postalTargets ?? { postalCode: 'postalCode', prefecture: 'prefecture', address: 'address' }
      const changes: Record<string, string> = { [t.postalCode]: cleanedInput, [t.address]: addr }
      if (t.prefecture) changes[t.prefecture] = data.prefecture
      onCommit(storeId, changes)
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
    if (editor === 'select' && searchable) {
      const filtered = (options ?? []).filter(o => o.label.toLowerCase().includes(searchQuery.toLowerCase()))

      function handleComboKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlight(h => Math.min(h + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlight(h => Math.max(h - 1, 0))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const opt = filtered[highlight] ?? filtered[0]
          if (opt) commitDraft(opt.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          cancel()
        }
      }

      return (
        <div ref={comboWrapRef} className="relative">
          <input
            ref={comboInputRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setHighlight(0) }}
            onKeyDown={handleComboKeyDown}
            placeholder="検索して選択..."
            className={baseCls}
          />
          {comboRect && (
            <>
              <div className="fixed inset-0 z-40" onClick={cancel} aria-hidden="true" />
              <div
                className="fixed z-50 max-h-56 overflow-y-auto rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-[var(--md-sys-elevation-2)]"
                style={{ top: comboRect.top, left: comboRect.left, width: comboRect.width }}
              >
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">該当する項目がありません</div>
                ) : filtered.map((o, i) => (
                  <button
                    key={o.value}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => commitDraft(o.value)}
                    className={`w-full text-left px-3 py-1.5 text-sm truncate flex items-center gap-1.5 ${
                      i === highlight
                        ? 'bg-[var(--md-sys-color-surface-container-high)]'
                        : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
                    }`}
                  >
                    <span className="w-3.5 flex-shrink-0 text-[var(--portal-primary,#374151)]">{o.value === draft ? '✓' : ''}</span>
                    <span className="truncate">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )
    }
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
      {readOnly && lockHint && (
        <svg className="w-3 h-3 mr-1 flex-shrink-0 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
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
