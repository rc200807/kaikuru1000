/**
 * ルート遷移中に出す骨組み（loading.tsx から使う）。
 *
 * 店舗・管理ポータルのレイアウトはサーバーで認証を解決するため、
 * 遷移のたびに1往復（日本→米国リージョンで0.3秒前後）待つ。その間に
 * 何も変わらないと「固まった」ように見えるので、先に骨組みだけ出す。
 *
 * サーバーコンポーネント（JSを増やさない）。アニメーションはCSSのみ。
 */
export default function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      {/* ヘッダー相当 */}
      <div className="px-4 sm:px-6 py-3 min-h-[var(--appbar-h)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="h-4 w-40 rounded bg-[var(--md-sys-color-surface-container-high)]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* KPI 相当 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]" />
          ))}
        </div>

        {/* 本文相当 */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]" />
        ))}
      </div>
    </div>
  )
}
