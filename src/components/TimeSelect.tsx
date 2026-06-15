'use client'

/**
 * 30分刻みの時刻プルダウン（00:00〜23:30）。
 * ネイティブ `<input type="time">` の step がブラウザ依存で30分刻みにならないため、
 * 訪問スケジュール系の時刻入力はこのコンポーネントで統一する。
 */
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

export default function TimeSelect({
  label,
  value,
  onChange,
  required = false,
  className = '',
  selectClassName,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  className?: string
  selectClassName?: string
}) {
  // 既存値が候補に無い場合（過去データの :15 等）も選べるよう先頭に追加
  const extra = value && !TIME_OPTIONS.includes(value) ? [value] : []
  return (
    <div className={className}>
      {label && (
        <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">
          {label}{required && <span className="text-[var(--md-sys-color-error,#B3261E)] ml-0.5">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={selectClassName ?? 'w-full h-12 px-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40'}
      >
        <option value="">--:--</option>
        {extra.map(t => <option key={t} value={t}>{t}</option>)}
        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  )
}
