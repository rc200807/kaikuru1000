'use client'

import type { FormField } from '@/lib/forms/types'
import { FIELD_TYPE_LABELS } from '@/lib/forms/types'

interface Props {
  field: FormField | null
  onChange: (next: FormField) => void
  onDelete: () => void
}

const inputCls =
  'w-full rounded-[6px] px-3 py-2 text-sm bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] placeholder:text-[#737373] focus:outline-none transition-shadow'

const inputStyle: React.CSSProperties = {
  boxShadow: 'rgba(255,255,255,0.10) 0 0 0 1px',
}

const inputFocusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.boxShadow = 'hsla(212, 100%, 48%, 1) 0 0 0 2px'
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.boxShadow = 'rgba(255,255,255,0.10) 0 0 0 1px'
  },
}

export default function FieldEditor({ field, onChange, onDelete }: Props) {
  if (!field) {
    return (
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        フィールドを選択すると詳細を編集できます。
      </p>
    )
  }

  if (field.type === 'heading' || field.type === 'paragraph') {
    return (
      <div className="space-y-3">
        <FieldHeader field={field} onDelete={onDelete} />
        <div>
          <Label>テキスト</Label>
          {field.type === 'heading' ? (
            <input value={field.text} onChange={(e) => onChange({ ...field, text: e.target.value })} className={inputCls} style={inputStyle} {...inputFocusHandlers} />
          ) : (
            <textarea value={field.text} onChange={(e) => onChange({ ...field, text: e.target.value })} rows={4} className={inputCls} style={inputStyle} {...inputFocusHandlers} />
          )}
        </div>
      </div>
    )
  }

  const hasOptions = field.type === 'select' || field.type === 'radio' || field.type === 'checkbox'

  return (
    <div className="space-y-3">
      <FieldHeader field={field} onDelete={onDelete} />
      <div>
        <Label>ラベル</Label>
        <input value={(field as any).label ?? ''} onChange={(e) => onChange({ ...field, label: e.target.value } as FormField)} className={inputCls} style={inputStyle} {...inputFocusHandlers} />
      </div>

      {('placeholder' in field) && (
        <div>
          <Label>プレースホルダ</Label>
          <input value={field.placeholder ?? ''} onChange={(e) => onChange({ ...field, placeholder: e.target.value } as FormField)} className={inputCls} style={inputStyle} {...inputFocusHandlers} />
        </div>
      )}

      {('helpText' in field) && (
        <div>
          <Label>補足テキスト</Label>
          <input value={field.helpText ?? ''} onChange={(e) => onChange({ ...field, helpText: e.target.value } as FormField)} className={inputCls} style={inputStyle} {...inputFocusHandlers} />
        </div>
      )}

      {hasOptions && (
        <OptionsEditor
          options={(field as any).options as string[]}
          onChange={(opts) => onChange({ ...field, options: opts } as FormField)}
        />
      )}

      {('required' in field) && (
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={!!(field as any).required}
            onChange={(e) => onChange({ ...field, required: e.target.checked } as FormField)}
            className="w-4 h-4 rounded accent-[hsla(212,100%,48%,1)]"
          />
          <span className="text-sm text-[var(--md-sys-color-on-surface)]">必須項目にする</span>
        </label>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
      {children}
    </label>
  )
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  function update(idx: number, value: string) {
    const next = options.slice()
    next[idx] = value
    onChange(next)
  }
  function add() {
    onChange([...options, `選択肢${options.length + 1}`])
  }
  function remove(idx: number) {
    onChange(options.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= options.length) return
    const next = options.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }
  return (
    <div>
      <Label>選択肢</Label>
      <ul className="space-y-2">
        {options.map((opt, idx) => (
          <li
            key={idx}
            className="flex items-center gap-2 rounded-[8px] p-2 bg-[var(--md-sys-color-surface-container-lowest)]"
            style={{ boxShadow: 'rgba(255,255,255,0.08) 0 0 0 1px' }}
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(idx, 'up')}
                disabled={idx === 0}
                className="p-0.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-30 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
                aria-label="上へ"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button
                type="button"
                onClick={() => move(idx, 'down')}
                disabled={idx === options.length - 1}
                className="p-0.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-30 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
                aria-label="下へ"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <input
              value={opt}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={`選択肢${idx + 1}`}
              className="flex-1 bg-transparent text-sm text-[var(--md-sys-color-on-surface)] placeholder:text-[#737373] focus:outline-none px-1"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={options.length <= 1}
              className="p-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[#f87171] disabled:opacity-30 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
              aria-label="削除"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-2 w-full text-left text-sm px-2.5 py-2 rounded-[6px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
        style={{ boxShadow: 'rgba(255,255,255,0.08) 0 0 0 1px inset' }}
      >
        + 選択肢を追加
      </button>
    </div>
  )
}

function FieldHeader({ field, onDelete }: { field: FormField; onDelete: () => void }) {
  return (
    <div
      className="flex items-center justify-between pb-2"
      style={{ boxShadow: 'rgba(255,255,255,0.08) 0 1px 0 0' }}
    >
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">フィールドタイプ</p>
        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{FIELD_TYPE_LABELS[field.type]}</p>
      </div>
      <button type="button" onClick={onDelete} className="text-xs text-[#f87171] hover:text-[#fca5a5] font-medium">
        削除
      </button>
    </div>
  )
}
