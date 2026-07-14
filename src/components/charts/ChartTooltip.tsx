'use client'

// recharts用の共通ツールチップ。value のフォーマッタを差し替え可能
type Props = {
  active?: boolean
  payload?: any[]
  label?: string
  formatter?: (value: number, name: string) => string
}

export default function ChartTooltip({ active, payload, label, formatter }: Props) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      {label && <p className="font-bold text-[var(--md-sys-color-on-surface)] mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
          {formatter ? formatter(p.value, p.name) : `${p.name}: ${Number(p.value).toLocaleString()}`}
        </p>
      ))}
    </div>
  )
}
