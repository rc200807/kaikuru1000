'use client'

// 複数店舗を表示しているときだけ AppBar の直下に出るストリップ。
//
// 目的は2つ:
//  1. いまどの店舗のデータが混ざって出ているのかを、画面を問わず常に見えるようにする
//     （従来は左サイドバー最下部のユーザーメニューを開かないと分からなかった）
//  2. 「登録・変更はログイン中の店舗に対して行われる」ことを明示する
//     （表示スコープは閲覧専用で、書き込みは常にセッション店舗に帰属する = store-scope.ts の不変条件）
//
// 単一店舗のときは何も描画しない（既存の見た目を1pxも変えない）。
import { useStoreScope } from './StoreScopeContext'
import { useStoreIdentity } from './StoreChip'

export default function StoreScopeBar() {
  const scope = useStoreScope()
  const resolve = useStoreIdentity()

  if (!scope.isMulti) return null

  const selfName = resolve(scope.sessionStoreId)?.name ?? null

  return (
    <div className="bg-[var(--md-sys-color-surface-container-low)] border-t border-[var(--md-sys-color-outline-variant)]">
      <div className="px-4 sm:px-6 py-1.5 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">
          表示中
        </span>
        {scope.availableStores.map(store => {
          const identity = resolve(store.id)
          const checked = scope.selectedIds.includes(store.id)
          const isSelf = store.id === scope.sessionStoreId
          return (
            <button
              key={store.id}
              type="button"
              onClick={() => scope.toggleStore(store.id)}
              disabled={isSelf}
              title={isSelf ? 'ログイン中の店舗は常に表示されます' : checked ? 'この店舗を非表示にする' : 'この店舗も表示する'}
              className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                checked
                  ? 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]'
                  : 'border-dashed border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface-faint)]'
              } ${isSelf ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
            >
              <span
                className="inline-flex items-center justify-center rounded-full text-white text-[9px] font-semibold flex-shrink-0"
                style={{
                  width: 14,
                  height: 14,
                  backgroundColor: checked ? identity?.color : 'var(--md-sys-color-outline)',
                }}
                aria-hidden="true"
              >
                {identity?.initial ?? '?'}
              </span>
              {store.name}
            </button>
          )
        })}
        {selfName && (
          <span className="ml-auto text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap flex-shrink-0 pl-2">
            登録・変更は <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selfName}</span> に対して行われます
          </span>
        )}
      </div>
    </div>
  )
}
