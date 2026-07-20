'use client'

// B2 チャート異常の自動注釈カード: zスコア検知 + AI要因説明。
// 検出結果は onAnnotations 経由で親タブに渡し、チャート上のマーカーにも使う。
import { useEffect } from 'react'
import { fmtNum, fmtYen } from '@/lib/analytics/format'
import type { AnalyticsResponse, AnomaliesResult, AnalyticsTab } from '@/lib/analytics/types'
import { useAiPost, AiResultFooter, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams } from './aiShared'

type Props = {
  tab: AnalyticsTab
  query: string
  data: AnalyticsResponse
  onAnnotations?: (result: AnomaliesResult | null) => void
}

export default function AiAnomaliesCard({ tab, query, data, onAnnotations }: Props) {
  const ai = useAiPost<AnomaliesResult>('anomalies')

  useEffect(() => { ai.reset(); onAnnotations?.(null) }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (force = false) => {
    const result = await ai.generate({ tab, params: queryToParams(query), data }, force)
    onAnnotations?.(result)
  }

  const isYen = (key: string) => ['purchase', 'billing', 'sold'].includes(key)

  return (
    <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      <div className="flex items-center gap-2">
        <span className="text-amber-500"><SparkleIcon /></span>
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">異常検知</h3>
        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">急増・急減の自動検出 + AI要因分析</span>
        {!ai.content && !ai.loading && (
          <button
            onClick={() => run()}
            className="ml-auto text-xs px-3.5 py-1.5 rounded-full font-semibold border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]"
          >
            ⚡ スキャン
          </button>
        )}
      </div>

      {ai.loading && <AiLoadingSkeleton label="時系列をスキャンしています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}

      {ai.content && !ai.loading && (
        <div className="mt-3 space-y-2.5">
          {ai.content.annotations.length === 0 ? (
            <p className="text-xs py-2 text-[var(--md-sys-color-on-surface-variant)]">✓ この期間に統計的な異常は検出されませんでした</p>
          ) : (
            <>
              {ai.content.annotations.map((a, i) => (
                <div key={i} className="flex gap-2.5">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background: a.direction === 'spike' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: a.direction === 'spike' ? '#d97706' : '#ef4444',
                    }}
                  >
                    {a.direction === 'spike' ? '↑' : '↓'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                      {a.label}の{a.seriesName}が{a.direction === 'spike' ? '急増' : '急減'}
                      <span className="ml-1.5 font-normal tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                        {isYen(a.seriesKey) ? fmtYen(a.value) : fmtNum(a.value)}（平均 {isYen(a.seriesKey) ? fmtYen(a.expected) : fmtNum(a.expected)}）
                      </span>
                    </p>
                    {a.explanation && <p className="text-[11px] mt-0.5 leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{a.explanation}</p>}
                  </div>
                </div>
              ))}
              {ai.content.summary && (
                <p className="text-[11px] pt-1.5 border-t border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]">{ai.content.summary}</p>
              )}
            </>
          )}
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => run(true)} />
        </div>
      )}
    </div>
  )
}
