'use client'

// HubSpot流のクイックフィルタチップ。ドロップダウンで即時絞り込み、適用中は着色表示。
import { useState, useRef, useEffect } from 'react'

export type ChipOption = { value: string; label: string }

export type ChipDef =
  | { key: string; label: string; type: 'multi'; options: ChipOption[] }
  | { key: string; label: string; type: 'single'; options: ChipOption[] }
  // daterange は `${key}From` / `${key}To` の2キーを読み書きする
  | { key: string; label: string; type: 'daterange' }

type Props = {
  chips: ChipDef[]
  values: Record<string, string>
  onChange: (patch: Record<string, string>) => void
  /** チップ列の末尾に置く要素（詳細フィルターボタンなど） */
  trailing?: React.ReactNode
}

const DATE_PRESETS = [
  { label: '過去7日', days: 7 },
  { label: '過去30日', days: 30 },
  { label: '過去90日', days: 90 },
]

function jstToday(): Date {
  // JSTの「今日」を得る（サーバー/ブラウザのTZに依存しない）
  const s = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  return new Date(`${s}T00:00:00+09:00`)
}

function fmtYmd(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function fmtShort(ymd: string): string {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/)
  return m ? `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}` : ymd
}

// 選択肢がこの数を超えるチップは、ポップオーバー内に検索ボックスを表示する
const OPTION_SEARCH_THRESHOLD = 8

export default function FilterChipBar({ chips, values, onChange, trailing }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [optQuery, setOptQuery] = useState('')
  const barRef = useRef<HTMLDivElement>(null)

  // 開いているチップが変わったら選択肢検索をリセット
  useEffect(() => { setOptQuery('') }, [openKey])

  // 外側クリックで閉じる
  useEffect(() => {
    if (!openKey) return
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenKey(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openKey])

  function chipSummary(chip: ChipDef): string | null {
    if (chip.type === 'daterange') {
      const from = values[`${chip.key}From`] || ''
      const to = values[`${chip.key}To`] || ''
      if (!from && !to) return null
      if (from && to) return `${fmtShort(from)}〜${fmtShort(to)}`
      if (from) return `${fmtShort(from)}以降`
      return `${fmtShort(to)}以前`
    }
    const v = values[chip.key] || ''
    if (!v) return null
    const selected = v.split(',').filter(Boolean)
    const labels = selected
      .map(s => chip.options.find(o => o.value === s)?.label ?? s)
    if (labels.length === 0) return null
    if (labels.length <= 2) return labels.join('・')
    return `${labels[0]} 他${labels.length - 1}件`
  }

  function clearChip(chip: ChipDef) {
    if (chip.type === 'daterange') onChange({ [`${chip.key}From`]: '', [`${chip.key}To`]: '' })
    else onChange({ [chip.key]: '' })
  }

  function toggleMulti(chip: ChipDef & { type: 'multi' }, value: string) {
    const current = (values[chip.key] || '').split(',').filter(Boolean)
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onChange({ [chip.key]: next.join(',') })
  }

  return (
    <div ref={barRef} className="flex items-center gap-2 flex-wrap">
      {chips.map(chip => {
        const summary = chipSummary(chip)
        const active = summary !== null
        const open = openKey === chip.key
        return (
          <div key={chip.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : chip.key)}
              aria-expanded={open}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'border border-[var(--portal-primary,#374151)] bg-[color-mix(in_srgb,var(--portal-primary,#374151)_8%,transparent)] text-[var(--md-sys-color-on-surface)]'
                  : 'border border-dashed border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--portal-primary,#374151)]'
              }`}
            >
              <span>{active ? `${chip.label}: ${summary}` : chip.label}</span>
              {active ? (
                <span
                  role="button"
                  aria-label={`${chip.label}をクリア`}
                  onClick={(e) => { e.stopPropagation(); clearChip(chip); setOpenKey(null) }}
                  className="font-bold opacity-70 hover:opacity-100 px-0.5"
                >
                  ×
                </span>
              ) : (
                <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z" /></svg>
              )}
            </button>

            {open && (
              <div className="absolute z-40 top-full left-0 mt-1.5 min-w-[210px] max-h-80 overflow-y-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-lg p-1.5">
                {chip.type === 'daterange' ? (
                  <div className="p-1.5 space-y-2">
                    <div className="flex gap-1.5">
                      {DATE_PRESETS.map(p => (
                        <button
                          key={p.days}
                          type="button"
                          onClick={() => {
                            const today = jstToday()
                            const from = new Date(today.getTime() - p.days * 24 * 60 * 60 * 1000)
                            onChange({ [`${chip.key}From`]: fmtYmd(from), [`${chip.key}To`]: fmtYmd(today) })
                            setOpenKey(null)
                          }}
                          className="text-[11px] font-medium px-2 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        開始日
                        <input
                          type="date"
                          value={values[`${chip.key}From`] || ''}
                          onChange={e => onChange({ [`${chip.key}From`]: e.target.value })}
                          className="mt-0.5 w-full h-9 px-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                        />
                      </label>
                      <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        終了日
                        <input
                          type="date"
                          value={values[`${chip.key}To`] || ''}
                          onChange={e => onChange({ [`${chip.key}To`]: e.target.value })}
                          className="mt-0.5 w-full h-9 px-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                        />
                      </label>
                    </div>
                  </div>
                ) : (() => {
                  const showSearch = chip.options.length > OPTION_SEARCH_THRESHOLD
                  const kw = optQuery.trim().toLowerCase()
                  const opts = kw ? chip.options.filter(o => o.label.toLowerCase().includes(kw)) : chip.options
                  return (
                    <>
                      {showSearch && (
                        <div className="sticky top-0 z-10 p-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
                          <input
                            autoFocus
                            value={optQuery}
                            onChange={e => setOptQuery(e.target.value)}
                            placeholder="検索..."
                            className="w-full h-8 px-2.5 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
                          />
                        </div>
                      )}
                      {opts.map(opt => {
                        const selected = (values[chip.key] || '').split(',').filter(Boolean)
                        const checked = selected.includes(opt.value)
                        return (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                          >
                            <input
                              type={chip.type === 'multi' ? 'checkbox' : 'radio'}
                              checked={checked}
                              onChange={() => {
                                if (chip.type === 'multi') toggleMulti(chip, opt.value)
                                else { onChange({ [chip.key]: checked ? '' : opt.value }); setOpenKey(null) }
                              }}
                              className="w-4 h-4 accent-[var(--portal-primary,#374151)]"
                            />
                            {opt.label}
                          </label>
                        )
                      })}
                      {opts.length === 0 && (
                        <div className="px-2.5 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)] text-center">該当なし</div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
      {trailing}
    </div>
  )
}
