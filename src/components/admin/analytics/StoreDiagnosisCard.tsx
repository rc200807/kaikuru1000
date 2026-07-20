'use client'

// ④ 店舗AI診断カード（StoresTab末尾）: 店舗を選んで全店舗平均と比較した診断カルテを生成
import { useState, useEffect } from 'react'
import type { DiagnosisResult, AnalyticsFilterOptions } from '@/lib/analytics/types'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
import { useAiPost, AiItemList, AiResultFooter, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams } from './aiShared'

export default function StoreDiagnosisCard({ query }: { query: string }) {
  const [stores, setStores] = useState<AnalyticsFilterOptions['stores']>([])
  const [storeId, setStoreId] = useState('')
  const ai = useAiPost<DiagnosisResult>('store-diagnosis')

  useEffect(() => {
    fetch('/api/admin/analytics/filters')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stores) setStores(d.stores) })
      .catch(() => {})
  }, [])

  useEffect(() => { ai.reset() }, [storeId, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (force = false) => {
    if (!storeId) return
    ai.generate({ storeId, params: queryToParams(query) }, force)
  }

  const scoreColor = (score: number) => score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'

  return (
    <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--md-sys-color-primary,#4f8ef7)]"><SparkleIcon /></span>
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">店舗AI診断</h3>
        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">全店舗ベンチマーク比較の診断カルテ</span>
        <div className="flex items-center gap-2 ml-auto">
          <StoreFilterSelect value={storeId} onChange={setStoreId} stores={stores} allLabel="店舗を選択…" style={{ minWidth: 150, maxWidth: 200 }} />
          <button
            onClick={() => run()}
            disabled={!storeId || ai.loading}
            className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] disabled:opacity-40 hover:opacity-90"
          >
            ✨ 診断する
          </button>
        </div>
      </div>

      {ai.loading && <AiLoadingSkeleton label="全店舗と比較して診断しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}

      {ai.content && !ai.loading && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--md-sys-color-surface-container-high, #eee)" strokeWidth="3.2" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={scoreColor(ai.content.score)} strokeWidth="3.2" strokeLinecap="round"
                  strokeDasharray={`${ai.content.score} 100`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums" style={{ color: scoreColor(ai.content.score) }}>
                {ai.content.score}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--md-sys-color-on-surface)]">{ai.content.summary}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#22c55e' }}>💪 強み</p>
                <AiItemList items={ai.content.strengths} />
              </div>
              <div>
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#ef4444' }}>📉 弱み</p>
                <AiItemList items={ai.content.weaknesses} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#4f8ef7' }}>🔭 機会</p>
                <AiItemList items={ai.content.opportunities} />
              </div>
              <div>
                <p className="text-[10px] font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">✓ 改善アクション</p>
                <AiItemList items={ai.content.actions} />
              </div>
            </div>
          </div>

          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => run(true)} />
        </div>
      )}
    </div>
  )
}
