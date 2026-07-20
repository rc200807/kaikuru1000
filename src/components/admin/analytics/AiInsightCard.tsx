'use client'

// ① タブAIインサイト要約カード（各タブのMetaCaption直下に設置）
import { useEffect } from 'react'
import type { AnalyticsResponse, TabInsight, AnalyticsTab } from '@/lib/analytics/types'
import { useAiPost, AiItemList, AiResultFooter, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams } from './aiShared'

type Props = {
  tab: AnalyticsTab
  query: string
  data: AnalyticsResponse
}

export default function AiInsightCard({ tab, query, data }: Props) {
  const ai = useAiPost<TabInsight>('summary')

  // フィルタ・期間が変わったら結果をリセット（自動生成はしない）
  useEffect(() => { ai.reset() }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (force = false) => ai.generate({ tab, params: queryToParams(query), data }, force)

  return (
    <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      <div className="flex items-center gap-2">
        <span className="text-[var(--md-sys-color-primary,#4f8ef7)]"><SparkleIcon /></span>
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">AIインサイト</h3>
        {!ai.content && !ai.loading && (
          <button
            onClick={() => run()}
            className="ml-auto text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90"
          >
            ✨ AIで分析
          </button>
        )}
      </div>

      {ai.loading && <AiLoadingSkeleton />}
      {ai.error && <AiErrorNote message={ai.error} />}

      {ai.content && !ai.loading && (
        <div className="mt-3 space-y-3.5">
          <p className="text-[13px] font-bold leading-relaxed text-[var(--md-sys-color-on-surface)]">
            {ai.content.headline}
          </p>
          <AiItemList items={ai.content.highlights} />
          {ai.content.anomalies.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">⚠ 異常・懸念</p>
              <AiItemList items={ai.content.anomalies} />
            </div>
          )}
          {ai.content.actions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">✓ 推奨アクション</p>
              <AiItemList items={ai.content.actions} />
            </div>
          )}
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => run(true)} />
        </div>
      )}
    </div>
  )
}
