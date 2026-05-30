/** 単一スケルトンブロック。`className` で寸法指定（例: "h-4 w-32"）。 */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--md-sys-color-surface-container-high)] rounded ${className}`} />
}

/** 一覧（サムネ付きカード）用のスケルトン。 */
export function SkeletonCardList({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 flex gap-3">
          <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
