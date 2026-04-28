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
        <div>
          <Label>選択肢（1行に1つ）</Label>
          <textarea
            value={(field as any).options.join('\n')}
            onChange={(e) => onChange({ ...field, options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } as FormField)}
            rows={5}
            className={inputCls}
            style={inputStyle}
            {...inputFocusHandlers}
          />
        </div>
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
