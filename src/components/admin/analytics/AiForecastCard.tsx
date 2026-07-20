'use client'

// A1 売上AI予測カード: 直近12ヶ月実績 + 3ヶ月予測帯 + 当月着地予測 + AI講評
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ChartTooltip from '@/components/charts/ChartTooltip'
import { CHART_PRIMARY } from '@/components/charts/chartColors'
import { fmtYen, fmtAxis } from '@/lib/analytics/format'
import type { ForecastResult } from '@/lib/analytics/types'
import { useAiPost, AiItemList, AiResultFooter, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams } from './aiShared'

export default function AiForecastCard({ query }: { query: string }) {
  const ai = useAiPost<ForecastResult>('forecast')
  const run = (force = false) => ai.generate({ params: queryToParams(query) }, force)

  const chartData = ai.content
    ? [
        ...ai.content.history.map(h => ({ label: h.label, actual: h.value })),
        // 実績最終点と予測を接続
        ...ai.content.forecast.map((f, i) => ({
          label: f.label,
          forecast: f.value,
          band: [f.low, f.high] as [number, number],
          ...(i === 0 ? {} : {}),
        })),
      ]
    : []
  if (ai.content && chartData.length > 0 && ai.content.history.length > 0) {
    // 予測線を実績の最終点から始める（見た目の連続性）
    const lastIdx = ai.content.history.length - 1
    ;(chartData[lastIdx] as any).forecast = ai.content.history[lastIdx].value
  }

  return (
    <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      <div className="flex items-center gap-2">
        <span className="text-[var(--md-sys-color-primary,#4f8ef7)]"><SparkleIcon /></span>
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">AI売上予測（買取金額）</h3>
        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">直近12ヶ月 → 3ヶ月先</span>
        {!ai.content && !ai.loading && (
          <button
            onClick={() => run()}
            className="ml-auto text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90"
          >
            ✨ 予測を生成
          </button>
        )}
      </div>

      {ai.loading && <AiLoadingSkeleton label="トレンドを分析して予測しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}

      {ai.content && !ai.loading && (
        <div className="mt-3 space-y-3.5">
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{ai.content.landing.periodLabel}の着地予測</p>
              <p className="text-xl font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{fmtYen(ai.content.landing.projected)}</p>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">現時点 {fmtYen(ai.content.landing.current)}</p>
            </div>
            {ai.content.forecast.map(f => (
              <div key={f.label}>
                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{f.label} 予測</p>
                <p className="text-sm font-semibold tabular-nums text-[var(--md-sys-color-on-surface)]">{fmtYen(f.value)}</p>
                <p className="text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{fmtYen(f.low)}〜{fmtYen(f.high)}</p>
              </div>
            ))}
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtAxis(v)} width={44} />
                <Tooltip content={<ChartTooltip formatter={(v, name) => Array.isArray(v) ? `${name}: ${fmtYen(v[0])}〜${fmtYen(v[1])}` : `${name}: ¥${Number(v).toLocaleString()}`} />} />
                <Area dataKey="band" name="予測レンジ" fill={CHART_PRIMARY} fillOpacity={0.12} stroke="none" isAnimationActive={false} />
                <Line dataKey="actual" name="実績" stroke={CHART_PRIMARY} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                <Line dataKey="forecast" name="予測" stroke={CHART_PRIMARY} strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} type="monotone" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <AiItemList items={ai.content.commentary} />
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => run(true)} />
        </div>
      )}
    </div>
  )
}
