'use client'

/**
 * 店舗ポータルのグラフ部品（ダッシュボード・顧客詳細・相場で共用）。
 *
 * recharts は重いので、ここだけ切り出して `next/dynamic`（ssr:false）で
 * 遅延読み込みする。ダッシュボードは**ログイン直後の着地画面**なので、
 * 初期JSから外せるぶんが体感にそのまま効く。
 *
 * recharts の名前付きインポートを JSX 中に直書きしていると個別に dynamic 化できないため、
 * サブツリーごとこのファイルへ移した。
 */
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const ACCENT = '#b91c1c'
const GRID = '#e5e5e5'
const TICK = '#a3a3a3'

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-2.5 py-1.5 text-xs shadow-md bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]">
      <div className="font-medium text-[var(--md-sys-color-on-surface)]">{label}</div>
      <div className="text-[var(--md-sys-color-on-surface-variant)]">
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </div>
    </div>
  )
}

/**
 * 月次の推移グラフ（買取金額・訪問件数・案件数で共用）。
 * gradientId は SVG の <defs> が同一ページで衝突しないよう呼び出し側で分ける。
 */
export function AreaTrendChart({
  data, dataKey, gradientId, tooltipFormatter, yTickFormatter, yWidth, marginLeft = -8, allowDecimals = false,
  tooltipSeriesName, accent = ACCENT, grid = GRID, tick = TICK,
}: {
  data: any[]
  dataKey: string
  gradientId: string
  tooltipFormatter: (v: number) => string
  yTickFormatter?: (v: number) => string
  yWidth: number
  marginLeft?: number
  allowDecimals?: boolean
  /**
   * 指定するとカスタムのツールチップではなく recharts 既定のツールチップに
   * 「値・系列名」の形で出す（顧客詳細・相場の従来の見た目に合わせるため）。
   */
  tooltipSeriesName?: string
  accent?: string
  grid?: string
  tick?: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: marginLeft, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.14} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false}
          tickFormatter={yTickFormatter} allowDecimals={allowDecimals} width={yWidth}
        />
        {tooltipSeriesName ? (
          <Tooltip
            formatter={(v: any) => [tooltipFormatter(Number(v)), tooltipSeriesName] as [string, string]}
            labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
        ) : (
          <Tooltip content={<ChartTooltip formatter={tooltipFormatter} />} />
        )}
        <Area
          type="monotone" dataKey={dataKey} stroke={accent} strokeWidth={2}
          fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, fill: accent, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** ドーナツグラフ（案件ステータスの割合・流入経路の割合で共用） */
export function DonutChart({
  data, innerRadius = 42, outerRadius = 66, unit = '件',
}: {
  data: { name: string; value: number; color: string }[]
  innerRadius?: number
  outerRadius?: number
  unit?: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={2}>
          {data.map((e, i) => <Cell key={i} fill={e.color} />)}
        </Pie>
        <Tooltip formatter={(value: any, name: any) => [`${value}${unit}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
