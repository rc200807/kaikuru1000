'use client'

// D1 チャートクリック→AI解説。useExplainPoint フックでタブに組み込む。
import { useState, useCallback } from 'react'
import { buildBuckets, bucketDateRange, dateFromJstStr, addDaysStr } from '@/lib/analytics/period'
import type { AnalyticsResponse, AnalyticsTab, ExplainPointResult } from '@/lib/analytics/types'
import { useAiPost, AiItemList, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams } from './aiShared'

type PendingPoint = { metric: string; bucketLabel: string; from: string; to: string }

export function useExplainPoint(tab: AnalyticsTab, query: string, meta: AnalyticsResponse['meta'] | undefined) {
  const [pending, setPending] = useState<PendingPoint | null>(null)
  const ai = useAiPost<ExplainPointResult>('explain-point')

  /** チャートに渡す onPointClick を作る（metric = チャート名） */
  const handlerFor = useCallback((metric: string) => {
    if (!meta) return undefined
    return (index: number, label: string) => {
      const range = { from: dateFromJstStr(meta.range.from), to: dateFromJstStr(addDaysStr(meta.range.to, 1)) }
      const buckets = buildBuckets(range, meta.granularity)
      const bucket = buckets[index]
      if (!bucket) return
      const { from, to } = bucketDateRange(bucket.key, meta.granularity)
      const point = { metric, bucketLabel: label, from, to }
      setPending(point)
      ai.generate({ tab, params: queryToParams(query), ...point })
    }
  }, [meta, tab, query, ai])

  const close = () => { setPending(null); ai.reset() }

  const modal = pending ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-2xl p-5 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[var(--md-sys-color-primary,#4f8ef7)]"><SparkleIcon /></span>
          <div>
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">AI解説: {pending.bucketLabel}</h3>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{pending.metric} ・ {pending.from} 〜 {pending.to}</p>
          </div>
          <button onClick={close} className="ml-auto text-lg leading-none px-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]">×</button>
        </div>

        {ai.loading && <AiLoadingSkeleton label="この期間の内訳を調べています…" />}
        {ai.error && <AiErrorNote message={ai.error} />}
        {ai.content && !ai.loading && (
          <div className="space-y-3">
            <p className="text-[13px] font-semibold leading-relaxed text-[var(--md-sys-color-on-surface)]">{ai.content.headline}</p>
            <AiItemList items={ai.content.findings} />
          </div>
        )}
      </div>
    </div>
  ) : null

  return { handlerFor, modal }
}
