'use client'

type FilterConfig = {
  key: string
  label: string
  type: 'text' | 'select' | 'date'
  placeholder?: string
  options?: { value: string; label: string }[]
}

type SearchFilterBarProps = {
  filters: FilterConfig[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onClear?: () => void
  className?: string
}

export default function SearchFilterBar({
  filters,
  values,
  onChange,
  onClear,
  className = '',
}: SearchFilterBarProps) {
  const hasValues = Object.values(values).some(v => v.length > 0)

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      {filters.map(filter => (
        <div key={filter.key} className="flex-1 min-w-[180px] max-w-xs">
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
            {filter.label}
          </label>
          {filter.type === 'select' ? (
            <select
              value={values[filter.key] ?? ''}
              onChange={e => onChange(filter.key, e.target.value)}
              className="
                w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)]
                border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)]
                text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2
              "
            >
              <option value="">{filter.placeholder || 'すべて'}</option>
              {filter.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : filter.type === 'date' ? (
            <input
              type="date"
              value={values[filter.key] ?? ''}
              onChange={e => onChange(filter.key, e.target.value)}
              className="
                w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)]
                border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)]
                text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2
              "
            />
          ) : (
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={values[filter.key] ?? ''}
                onChange={e => onChange(filter.key, e.target.value)}
                placeholder={filter.placeholder || '検索...'}
                className="
                  w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)]
                  border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)]
                  text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)]
                  focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2
                "
              />
            </div>
          )}
        </div>
      ))}
      {onClear && hasValues && (
        <button
          onClick={onClear}
          className="h-10 px-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] rounded-[var(--md-sys-shape-small)] transition-colors"
        >
          クリア
        </button>
      )}
    </div>
  )
}
