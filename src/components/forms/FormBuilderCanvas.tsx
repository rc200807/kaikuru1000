'use client'

import { FIELD_TYPE_LABELS, type FormField, type FormSchema } from '@/lib/forms/types'

interface Props {
  schema: FormSchema
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
}

export default function FormBuilderCanvas({ schema, selectedId, onSelect, onMove }: Props) {
  if (schema.length === 0) {
    return (
      <div
        className="rounded-[8px] p-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]"
        style={{ boxShadow: 'rgba(255,255,255,0.08) 0 0 0 1px inset' }}
      >
        左のパレットから部品を追加してください
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {schema.map((f, idx) => {
        const isSelected = selectedId === f.id
        return (
          <li
            key={f.id}
            onClick={() => onSelect(f.id)}
            className="flex items-center gap-3 p-3 rounded-[8px] cursor-pointer transition-shadow"
            style={{
              backgroundColor: isSelected
                ? 'var(--md-sys-color-surface-container-high)'
                : 'var(--md-sys-color-surface-container-lowest)',
              boxShadow: isSelected
                ? 'hsla(212,100%,48%,1) 0 0 0 1.5px'
                : 'rgba(255,255,255,0.08) 0 0 0 1px',
            }}
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMove(f.id, 'up') }}
                disabled={idx === 0}
                className="p-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-30 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
                aria-label="上へ"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMove(f.id, 'down') }}
                disabled={idx === schema.length - 1}
                className="p-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-30 disabled:hover:text-[var(--md-sys-color-on-surface-variant)]"
                aria-label="下へ"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">{FIELD_TYPE_LABELS[f.type]}</p>
              <p className="text-sm text-[var(--md-sys-color-on-surface)] truncate font-medium">{labelOf(f)}</p>
            </div>
            {'required' in f && f.required && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}>必須</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function labelOf(f: FormField): string {
  if (f.type === 'heading' || f.type === 'paragraph') return f.text || '(未入力)'
  return (f as Exclude<FormField, { type: 'heading' | 'paragraph' }>).label || '(無題)'
}
