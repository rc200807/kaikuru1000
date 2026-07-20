'use client'

// ステータスファネル（CSS幅バー + ステップ間転換率）
import { fmtNum, fmtPct } from '@/lib/analytics/format'

type Step = { name: string; count: number }

type Props = {
  steps: Step[]
  color?: string
}

export default function FunnelSteps({ steps, color = '#4f8ef7' }: Props) {
  const max = Math.max(...steps.map(s => s.count), 1)

  if (steps.length === 0 || max === 0) {
    return <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-variant)]">データがありません</p>
  }

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].count : null
        const conversion = prev != null && prev > 0 ? step.count / prev : null
        return (
          <div key={step.name}>
            {i > 0 && (
              <div className="flex items-center gap-1 pl-24 py-0.5 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" /></svg>
                {conversion != null ? fmtPct(conversion, 0) : '—'}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <span className="text-xs w-20 truncate flex-shrink-0 text-[var(--md-sys-color-on-surface)]">{step.name}</span>
              <div className="flex-1 h-7 rounded-md bg-[var(--md-sys-color-surface-container-high,#eee)] overflow-hidden">
                <div
                  className="h-7 rounded-md flex items-center px-2 transition-all"
                  style={{ width: `${Math.max((step.count / max) * 100, step.count > 0 ? 8 : 0)}%`, background: color, opacity: 1 - i * 0.12 }}
                >
                  <span className="text-[11px] font-bold text-white tabular-nums">{fmtNum(step.count)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
