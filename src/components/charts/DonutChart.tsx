'use client'

// ドーナツチャート + 凡例リスト（構成比付き）
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import ChartTooltip from '@/components/charts/ChartTooltip'
import { CHART_COLORS } from '@/components/charts/chartColors'
import { fmtYen, fmtNum } from '@/lib/analytics/format'

type Item = { name: string; value: number; color?: string }

type Props = {
  items: Item[]
  height?: number
  valueFormat?: 'yen' | 'count'
}

export default function DonutChart({ items, height = 208, valueFormat = 'count' }: Props) {
  const data = items.filter(i => i.value > 0)
  const total = data.reduce((s, i) => s + i.value, 0)
  const fmt = valueFormat === 'yen' ? fmtYen : fmtNum

  if (data.length === 0 || total === 0) {
    return <p className="text-sm text-center py-12 text-[var(--md-sys-color-on-surface-variant)]">データがありません</p>
  }

  return (
    <div className="flex items-center gap-2" style={{ height }}>
      <ResponsiveContainer width="52%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(Number(v))}`} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-full py-2">
        {data.map((entry, i) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="truncate text-[var(--md-sys-color-on-surface)]">{entry.name}</span>
            <span className="ml-auto tabular-nums text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">
              {fmt(entry.value)}
              <span className="ml-1">({((entry.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
