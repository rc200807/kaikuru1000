'use client'

// GA風の期間・比較・粒度・絞り込みバー
import { PRESETS, PRESET_LABEL, PresetKey, CompareMode, Granularity, GRANULARITY_LABEL } from '@/lib/analytics/period'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import type { AnalyticsFilterOptions, AnalyticsQueryState } from '@/lib/analytics/types'

export type FilterState = Omit<AnalyticsQueryState, 'tab'>

type Props = {
  state: FilterState
  options: AnalyticsFilterOptions | null
  onChange: (patch: Partial<FilterState>) => void
}

const selectClass = 'text-xs rounded-lg px-2 py-1.5 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] max-w-[160px]'

export default function AnalyticsFilterBar({ state, options, onChange }: Props) {
  const hasFilter = state.storeId || state.dealCategory || state.customerType || state.leadSource

  return (
    <div className="rounded-2xl p-3.5 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] space-y-2.5">
      {/* 期間プリセット + カスタム */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(preset => (
          <button
            key={preset}
            onClick={() => onChange({ preset })}
            className={`text-xs px-2.5 py-1.5 rounded-full transition-colors ${
              state.preset === preset
                ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold'
                : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {PRESET_LABEL[preset as PresetKey]}
          </button>
        ))}
        {state.preset === 'custom' && (
          <span className="flex items-center gap-1 ml-1">
            <input
              type="date"
              value={state.from ?? ''}
              onChange={e => onChange({ from: e.target.value || null })}
              className={selectClass}
            />
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">〜</span>
            <input
              type="date"
              value={state.to ?? ''}
              onChange={e => onChange({ to: e.target.value || null })}
              className={selectClass}
            />
          </span>
        )}
      </div>

      {/* 比較・粒度・絞り込み */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={state.compare}
          onChange={e => onChange({ compare: e.target.value as CompareMode })}
          className={selectClass}
          disabled={state.preset === 'all'}
        >
          <option value="prev">前の期間と比較</option>
          <option value="year">前年同期と比較</option>
          <option value="none">比較なし</option>
        </select>

        <div className="flex rounded-lg overflow-hidden border border-[var(--md-sys-color-outline-variant)]">
          {(['auto', 'day', 'week', 'month'] as const).map(g => (
            <button
              key={g}
              onClick={() => onChange({ granularity: g })}
              className={`text-xs px-2.5 py-1.5 transition-colors ${
                state.granularity === g
                  ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold'
                  : 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface-variant)]'
              }`}
            >
              {g === 'auto' ? '自動' : GRANULARITY_LABEL[g as Granularity]}
            </button>
          ))}
        </div>

        <span className="w-px h-5 bg-[var(--md-sys-color-outline-variant)] hidden sm:block" />

        <select value={state.storeId ?? ''} onChange={e => onChange({ storeId: e.target.value || null })} className={selectClass}>
          <option value="">全店舗</option>
          {(options?.stores ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select value={state.dealCategory ?? ''} onChange={e => onChange({ dealCategory: e.target.value || null })} className={selectClass}>
          <option value="">全カテゴリー</option>
          {DEAL_CATEGORIES.map(c => <option key={c} value={c}>{DEAL_CATEGORY_LABEL[c]}</option>)}
        </select>

        <select value={state.customerType ?? ''} onChange={e => onChange({ customerType: e.target.value || null })} className={selectClass}>
          <option value="">全顧客種別</option>
          {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>)}
        </select>

        <select value={state.leadSource ?? ''} onChange={e => onChange({ leadSource: e.target.value || null })} className={selectClass}>
          <option value="">全流入経路</option>
          {(options?.leadSources ?? []).map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {hasFilter && (
          <button
            onClick={() => onChange({ storeId: null, dealCategory: null, customerType: null, leadSource: null })}
            className="text-xs px-2 py-1.5 rounded-lg text-[var(--md-sys-color-primary,#374151)] hover:underline"
          >
            絞り込み解除
          </button>
        )}
      </div>
    </div>
  )
}
