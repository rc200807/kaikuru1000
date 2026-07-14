'use client'

// ページ番号ネーション（「もっと読み込む」の後継）
type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

/** 表示するページ番号列を組み立て（1 … 4 5 [6] 7 8 … 20 形式） */
function pageItems(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const items: (number | '…')[] = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pageCount - 1, page + 1)
  if (from > 2) items.push('…')
  for (let i = from; i <= to; i++) items.push(i)
  if (to < pageCount - 1) items.push('…')
  items.push(pageCount)
  return items
}

export default function PageNav({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null
  return (
    <nav className="flex items-center justify-center gap-1 mt-5" aria-label="ページ切り替え">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="min-w-8 h-8 px-1 rounded-lg text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-30"
        aria-label="前のページ"
      >
        ‹
      </button>
      {pageItems(page, pageCount).map((item, i) =>
        item === '…' ? (
          <span key={`e${i}`} className="px-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">…</span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={`min-w-8 h-8 px-1 rounded-lg text-sm tabular-nums ${
              item === page
                ? 'bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] font-bold'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="min-w-8 h-8 px-1 rounded-lg text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-30"
        aria-label="次のページ"
      >
        ›
      </button>
    </nav>
  )
}
