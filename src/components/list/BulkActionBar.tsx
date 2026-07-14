'use client'

// 一括操作バー。行選択時にテーブル直上へ表示される。
// 「該当する全件を選択」はIDリストではなくフィルタ条件をサーバーへ渡すモード。

export type BulkAction = {
  key: string
  label: string
  tone?: 'danger'
}

type Props = {
  /** 明示選択された件数 */
  selectedCount: number
  /** フィルタに該当する総件数 */
  totalCount: number
  /** 「該当する全件」モードか */
  allMatching: boolean
  onSelectAllMatching: () => void
  onClearSelection: () => void
  actions: BulkAction[]
  onAction: (key: string) => void
  /** 実行中のアクションキー（ボタンをdisableする） */
  busyAction?: string | null
}

export default function BulkActionBar({
  selectedCount, totalCount, allMatching,
  onSelectAllMatching, onClearSelection,
  actions, onAction, busyAction,
}: Props) {
  const effectiveCount = allMatching ? totalCount : selectedCount
  if (effectiveCount === 0) return null

  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 mb-3 rounded-xl border border-[var(--portal-primary,#374151)] bg-[color-mix(in_srgb,var(--portal-primary,#374151)_7%,transparent)]">
      <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
        {allMatching ? `該当する全${totalCount.toLocaleString()}件を選択中` : `${selectedCount.toLocaleString()}件を選択中`}
      </span>
      {!allMatching && selectedCount < totalCount && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="text-xs underline text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
        >
          該当する全{totalCount.toLocaleString()}件を選択
        </button>
      )}
      <button
        type="button"
        onClick={onClearSelection}
        className="text-xs underline text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
      >
        選択を解除
      </button>
      <span className="flex-1" />
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map(a => (
          <button
            key={a.key}
            type="button"
            disabled={!!busyAction}
            onClick={() => onAction(a.key)}
            className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 whitespace-nowrap ${
              a.tone === 'danger'
                ? 'border-[var(--md-sys-color-error,#B3261E)] text-[var(--md-sys-color-error,#B3261E)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-error,#B3261E)_8%,transparent)]'
                : 'border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            {busyAction === a.key ? '処理中...' : a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
