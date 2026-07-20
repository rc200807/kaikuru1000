'use client'

// 汎用時系列チャート（Area/Bar/Line 混在 + 比較期間の破線オーバーレイ対応）
import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import ChartTooltip from '@/components/charts/ChartTooltip'
import { fmtAxis } from '@/lib/analytics/format'
import type { SeriesPoint } from '@/lib/analytics/types'

export type SeriesDef = {
  key: string
  name: string
  color: string
  type?: 'area' | 'bar' | 'line'
  /** 比較期間の系列（破線で描画） */
  dashed?: boolean
  stackId?: string
}

type Props = {
  data: SeriesPoint[]
  series: SeriesDef[]
  height?: number
  /** 'yen' で軸・ツールチップを金額表記に */
  valueFormat?: 'yen' | 'count'
  showLegend?: boolean
}

export default function TimeSeriesChart({ data, series, height = 208, valueFormat = 'count', showLegend = true }: Props) {
  const gridStroke = 'var(--md-sys-color-outline-variant)'
  const tooltipFormatter = valueFormat === 'yen'
    ? (v: number, name: string) => `${name}: ¥${Number(v).toLocaleString()}`
    : (v: number, name: string) => `${name}: ${Number(v).toLocaleString()}`

  if (data.length === 0) {
    return <p className="text-sm text-center py-12 text-[var(--md-sys-color-on-surface-variant)]">データがありません</p>
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
          <defs>
            {series.filter(s => (s.type ?? 'area') === 'area' && !s.dashed).map(s => (
              <linearGradient key={s.key} id={`ts-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => (valueFormat === 'yen' ? fmtAxis(v) : String(v))}
            width={valueFormat === 'yen' ? 44 : 32}
          />
          <Tooltip content={<ChartTooltip formatter={tooltipFormatter} />} />
          {showLegend && series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
          )}
          {series.map(s => {
            const type = s.dashed ? 'line' : (s.type ?? 'area')
            if (type === 'bar') {
              return <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stackId} radius={s.stackId ? undefined : [3, 3, 0, 0]} maxBarSize={28} />
            }
            if (type === 'line') {
              return (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.dashed ? 1.5 : 2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  dot={false}
                  type="monotone"
                />
              )
            }
            return (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#ts-${s.key})`}
                type="monotone"
                stackId={s.stackId}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
