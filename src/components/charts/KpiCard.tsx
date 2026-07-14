'use client'

// 管理系ページ共通のKPIカード（MD3トークンベース）
type Props = {
  label: string
  value: string
  unit?: string
  /** 値の下に出す補足（前月比など） */
  sub?: string
  icon?: React.ReactNode
}

export default function KpiCard({ label, value, unit, sub, icon }: Props) {
  return (
    <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
        {icon && <span className="text-[var(--md-sys-color-outline)]">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-[var(--md-sys-color-on-surface)] tabular-nums">{value}</span>
        {unit && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{unit}</span>}
      </div>
      {sub && <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">{sub}</p>}
    </div>
  )
}
