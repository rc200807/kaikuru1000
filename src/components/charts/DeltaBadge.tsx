'use client'

// 前期間比の増減バッジ（▲+12.3% / ▼-5.0%）。compareValue が null のときは非表示
type Props = {
  value: number
  compareValue: number | null
  /** 減少が好ましい指標（失注率など）は true で色を反転 */
  invert?: boolean
}

export default function DeltaBadge({ value, compareValue, invert = false }: Props) {
  if (compareValue === null) return null
  if (compareValue === 0) {
    return <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">前期間 —</span>
  }
  const pct = ((value - compareValue) / Math.abs(compareValue)) * 100
  const up = pct >= 0
  const positive = invert ? !up : up
  const color = Math.abs(pct) < 0.05 ? '#94a3b8' : positive ? '#22c55e' : '#ef4444'
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color }}>
      {up ? '▲' : '▼'}{Math.abs(pct) >= 1000 ? Math.round(Math.abs(pct)).toLocaleString() : Math.abs(pct).toFixed(1)}%
    </span>
  )
}
