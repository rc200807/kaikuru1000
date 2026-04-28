'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormField, FormSchema } from '@/lib/forms/types'
import { PREFECTURES } from '@/lib/forms/types'

type Values = Record<string, any>

interface Props {
  schema: FormSchema
  initialValues?: Values
  onSubmit?: (values: Values) => Promise<void> | void
  submitting?: boolean
  submitLabel?: string
  /** プレビュー時など、送信ボタンを描画したくないとき true */
  hideSubmit?: boolean
  /** 各フィールドの編集UIで「選択中ハイライト」を出すための機能（ビルダー用） */
  selectedFieldId?: string
  onFieldClick?: (fieldId: string) => void
}

export default function FormRenderer({ schema, initialValues, onSubmit, submitting, submitLabel = '送信する', hideSubmit, selectedFieldId, onFieldClick }: Props) {
  const [values, setValues] = useState<Values>(() => initialValues ?? buildDefaults(schema))
  const [error, setError] = useState<string | null>(null)

  // schema の id 構成が変わった場合に既定値を更新
  const schemaIds = useMemo(() => schema.map(f => f.id).join('|'), [schema])
  useEffect(() => {
    if (initialValues) return
    setValues(prev => {
      const next: Values = { ...prev }
      for (const f of schema) {
        if (!(f.id in next) && f.type !== 'heading' && f.type !== 'paragraph') {
          next[f.id] = defaultFor(f)
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaIds])

  function setVal(id: string, v: any) {
    setValues(prev => ({ ...prev, [id]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await onSubmit?.(values)
    } catch (err: any) {
      setError(err?.message ?? '送信に失敗しました')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {schema.map(field => (
        <FieldView
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => setVal(field.id, v)}
          selected={selectedFieldId === field.id}
          onClick={onFieldClick ? () => onFieldClick(field.id) : undefined}
        />
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!hideSubmit && (
        <button type="submit" disabled={submitting} className="w-full md:w-auto inline-flex justify-center items-center gap-2 px-6 py-3 rounded-lg bg-[#0a0a0a] text-white font-semibold hover:bg-[#222] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? '送信中...' : submitLabel}
        </button>
      )}
    </form>
  )
}

function defaultFor(f: FormField): any {
  if (f.type === 'checkbox') return []
  if (f.type === 'name') return { last: '', first: '' }
  if (f.type === 'heading' || f.type === 'paragraph') return undefined
  return ''
}

function buildDefaults(schema: FormSchema): Values {
  const v: Values = {}
  for (const f of schema) {
    if (f.type === 'heading' || f.type === 'paragraph') continue
    v[f.id] = defaultFor(f)
  }
  return v
}

function FieldView({ field, value, onChange, selected, onClick }: { field: FormField; value: any; onChange: (v: any) => void; selected?: boolean; onClick?: () => void }) {
  const required = 'required' in field && field.required
  const wrapperCls = `${onClick ? 'cursor-pointer rounded-lg p-3 -m-3 transition ' + (selected ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-gray-50') : ''}`

  if (field.type === 'heading') {
    return (
      <div className={wrapperCls} onClick={onClick}>
        <h3 className="text-lg font-bold text-gray-900">{field.text}</h3>
      </div>
    )
  }
  if (field.type === 'paragraph') {
    return (
      <div className={wrapperCls} onClick={onClick}>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{field.text}</p>
      </div>
    )
  }

  // 装飾以外は label を持つ
  const inputField = field as Exclude<FormField, { type: 'heading' | 'paragraph' }>
  const labelEl = (
    <label className="block text-sm font-medium text-gray-800 mb-1.5">
      {inputField.label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )

  const helpEl = ('helpText' in inputField && inputField.helpText) ? <p className="mt-1 text-xs text-gray-500">{inputField.helpText}</p> : null

  const baseInput = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent'

  let control: React.ReactNode = null
  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'number':
    case 'date':
      control = (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          required={required}
          className={baseInput}
        />
      )
      break
    case 'textarea':
      control = (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          required={required}
          rows={4}
          className={baseInput}
        />
      )
      break
    case 'select': {
      const v: string = value ?? ''
      const isOther = field.allowOther && (v === 'その他' || v.startsWith('その他: '))
      const otherText = v.startsWith('その他: ') ? v.slice('その他: '.length) : ''
      const choice = isOther ? 'その他' : v
      control = (
        <div className="space-y-2">
          <select
            value={choice}
            onChange={(e) => {
              const next = e.target.value
              if (field.allowOther && next === 'その他') onChange(otherText ? `その他: ${otherText}` : 'その他')
              else onChange(next)
            }}
            required={required}
            className={baseInput}
          >
            <option value="">選択してください</option>
            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            {field.allowOther && <option value="その他">その他</option>}
          </select>
          {isOther && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => onChange(e.target.value ? `その他: ${e.target.value}` : 'その他')}
              placeholder="その他の内容を入力"
              className={baseInput}
            />
          )}
        </div>
      )
      break
    }
    case 'radio': {
      const v: string = value ?? ''
      const isOther = field.allowOther && (v === 'その他' || v.startsWith('その他: '))
      const otherText = v.startsWith('その他: ') ? v.slice('その他: '.length) : ''
      control = (
        <div className="space-y-2">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={field.id} value={opt} checked={v === opt} onChange={() => onChange(opt)} className="w-4 h-4 text-[#0a0a0a] focus:ring-[#0a0a0a]" />
              <span className="text-sm text-gray-800">{opt}</span>
            </label>
          ))}
          {field.allowOther && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={field.id}
                  checked={isOther}
                  onChange={() => onChange(otherText ? `その他: ${otherText}` : 'その他')}
                  className="w-4 h-4 text-[#0a0a0a] focus:ring-[#0a0a0a]"
                />
                <span className="text-sm text-gray-800">その他</span>
              </label>
              {isOther && (
                <input
                  type="text"
                  value={otherText}
                  onChange={(e) => onChange(e.target.value ? `その他: ${e.target.value}` : 'その他')}
                  placeholder="その他の内容を入力"
                  className={`${baseInput} ml-6 w-[calc(100%-1.5rem)]`}
                />
              )}
            </div>
          )}
        </div>
      )
      break
    }
    case 'checkbox':
      control = (
        <div className="space-y-2">
          {field.options.map(opt => {
            const arr: string[] = Array.isArray(value) ? value : []
            const checked = arr.includes(opt)
            return (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...arr, opt])
                    else onChange(arr.filter(v => v !== opt))
                  }}
                  className="w-4 h-4 rounded text-[#0a0a0a] focus:ring-[#0a0a0a]"
                />
                <span className="text-sm text-gray-800">{opt}</span>
              </label>
            )
          })}
        </div>
      )
      break
    case 'name': {
      const nv = (value && typeof value === 'object') ? value : { last: '', first: '' }
      control = (
        <div className="grid grid-cols-2 gap-3">
          <input value={nv.last ?? ''} onChange={(e) => onChange({ ...nv, last: e.target.value })} placeholder="姓" required={required} className={baseInput} />
          <input value={nv.first ?? ''} onChange={(e) => onChange({ ...nv, first: e.target.value })} placeholder="名" required={required} className={baseInput} />
        </div>
      )
      break
    }
    case 'prefecture':
      control = (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} className={baseInput}>
          <option value="">選択してください</option>
          {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )
      break
  }

  return (
    <div className={wrapperCls} onClick={onClick}>
      {labelEl}
      {control}
      {helpEl}
    </div>
  )
}
