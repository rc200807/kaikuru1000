'use client'

// 横棒ランキング（CSSバー。順位バッジ + 値表記）
import { fmtYen, fmtNum } from '@/lib/analytics/format'

type Item = { name: string; value: number; sub?: string }

type Props = {
  items: Item[]
  valueFormat?: 'yen' | 'count'
  color?: string
  showRank?: boolean
  emptyText?: string
}

export default function HBarRanking({ items, valueFormat = 'count', color = '#4f8ef7', showRank = true, emptyText = 'データがありません' }: Props) {
  const fmt = valueFormat === 'yen' ? fmtYen : fmtNum
  const max = Math.max(...items.map(i => i.value), 1)

  if (items.length === 0) {
    return <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-variant)]">{emptyText}</p>
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`} className="flex items-center gap-2.5">
          {showRank && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]">
              {i + 1}
            </span>
          )}
          <span className="text-xs w-32 truncate flex-shrink-0 text-[var(--md-sys-color-on-surface)]" title={item.name}>
            {item.name}
          </span>
          <div className="flex-1 rounded-full h-1.5 bg-[var(--md-sys-color-surface-container-high,#eee)]">
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
          <span className="text-xs w-20 text-right flex-shrink-0 font-semibold tabular-nums text-[var(--md-sys-color-on-surface)]">
            {fmt(item.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
