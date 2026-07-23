'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import EmptyState from './EmptyState'

type Column<T> = {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number
  hideOnMobile?: boolean
  width?: string
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  /** 行選択（チェックボックス）を有効にする */
  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectionChange?: (keys: Set<string>) => void
  /** サーバーサイドソート。指定するとクライアント側ソートは無効になる */
  serverSort?: { key: string; dir: 'asc' | 'desc' } | null
  onSortChange?: (key: string) => void
  /** セルを改行させない（横スクロールで全カラムを表示） */
  nowrap?: boolean
  /** 最終列を右端に固定表示（横スクロールしても常に見える。操作ボタン列向け） */
  stickyLastColumn?: boolean
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyTitle = 'データがありません',
  emptyDescription,
  className = '',
  selectable = false,
  selectedKeys,
  onSelectionChange,
  serverSort,
  onSortChange,
  nowrap = false,
  stickyLastColumn = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const headCheckRef = useRef<HTMLInputElement>(null)
  const [canScroll, setCanScroll] = useState(false)

  const serverMode = !!onSortChange
  const activeSortKey = serverMode ? (serverSort?.key ?? null) : sortKey
  const activeSortDir = serverMode ? (serverSort?.dir ?? 'asc') : sortDir

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return
    if (serverMode) {
      onSortChange!(col.key)
      return
    }
    if (sortKey === col.key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

  // 選択状態
  const selected = selectedKeys ?? new Set<string>()
  const pageKeys = data.map(rowKey)
  const allChecked = pageKeys.length > 0 && pageKeys.every(k => selected.has(k))
  const someChecked = pageKeys.some(k => selected.has(k))

  useEffect(() => {
    if (headCheckRef.current) headCheckRef.current.indeterminate = someChecked && !allChecked
  }, [someChecked, allChecked])

  function toggleRow(key: string) {
    if (!onSelectionChange) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  function toggleAll() {
    if (!onSelectionChange) return
    const next = new Set(selected)
    if (allChecked) pageKeys.forEach(k => next.delete(k))
    else pageKeys.forEach(k => next.add(k))
    onSelectionChange(next)
  }

  const sortedData = useMemo(() => {
    if (serverMode) return data
    if (!sortKey) return data
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return data
    const sorted = [...data].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    return sortDir === 'desc' ? sorted.reverse() : sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sortKey, sortDir, columns, serverMode])

  // Check if table is scrollable
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setCanScroll(el.scrollWidth > el.clientWidth + 2)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [data, columns])

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  // Calculate min-width based on visible column count on mobile
  const visibleOnMobile = columns.filter(c => !c.hideOnMobile).length
  const totalCount = columns.length
  // Desktop uses total columns, mobile uses only visible ones
  const getMinWidth = () => {
    if (totalCount > 6) return 'md:min-w-[1100px]'
    if (totalCount > 4) return 'md:min-w-[900px]'
    if (totalCount > 3) return 'md:min-w-[700px]'
    return 'md:min-w-[500px]'
  }
  const getMobileMinWidth = () => {
    if (visibleOnMobile > 4) return 'min-w-[600px]'
    if (visibleOnMobile > 3) return 'min-w-[480px]'
    if (visibleOnMobile > 2) return 'min-w-[380px]'
    return 'min-w-[300px]'
  }

  return (
    <div className="relative">
      {/* Scroll hint fade (right edge) */}
      {canScroll && (
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[var(--md-sys-color-surface-container-lowest,#fff)] to-transparent z-10 pointer-events-none rounded-r-[var(--md-sys-shape-medium)]" />
      )}
      <div
        ref={scrollRef}
        className={`overflow-x-auto table-scroll-container ${className}`}
      >
        <table className={`w-full text-sm ${getMobileMinWidth()} ${getMinWidth()}`}>
          <thead>
            <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    ref={headCheckRef}
                    type="checkbox"
                    aria-label="このページをすべて選択"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-[var(--portal-primary,#374151)] cursor-pointer align-middle"
                  />
                </th>
              )}
              {columns.map((col, i) => {
                const isStickyLast = stickyLastColumn && i === columns.length - 1
                return (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  style={col.width ? { width: col.width } : undefined}
                  className={`
                    text-left px-3 py-3 text-xs font-medium whitespace-nowrap
                    text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider
                    ${col.sortable ? 'cursor-pointer select-none hover:text-[var(--md-sys-color-on-surface)]' : ''}
                    ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                    ${isStickyLast ? 'sticky right-0 z-20 bg-[var(--md-sys-color-surface-container-lowest,#fff)] border-l border-[var(--md-sys-color-outline-variant)]' : ''}
                  `}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && activeSortKey === col.key && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 transition-transform ${activeSortDir === 'desc' ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M8 3.5a.75.75 0 01.75.75v6.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V4.25A.75.75 0 018 3.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.map(row => {
              const key = rowKey(row)
              const isSelected = selectable && selected.has(key)
              // 固定列(sticky)は横スクロール中に背景が透けないよう不透明色にする。
              // 行の状態(選択/ホバー)に合わせて surface-container-lowest を土台にした不透明色を使う。
              const stickyCellBg = isSelected
                ? 'bg-[color-mix(in_srgb,var(--portal-primary,#374151)_6%,var(--md-sys-color-surface-container-lowest,#fff))]'
                : 'bg-[var(--md-sys-color-surface-container-lowest,#fff)]'
              const stickyCellHover = onRowClick ? 'group-hover:bg-[var(--md-sys-color-surface-container-low)]' : ''
              return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`
                  group border-b border-[var(--md-sys-color-surface-container-high)]
                  ${isSelected ? 'bg-[color-mix(in_srgb,var(--portal-primary,#374151)_6%,transparent)]' : ''}
                  ${onRowClick
                    ? 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors'
                    : ''
                  }
                `}
              >
                {selectable && (
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="行を選択"
                      checked={selected.has(key)}
                      onChange={() => toggleRow(key)}
                      className="w-4 h-4 accent-[var(--portal-primary,#374151)] cursor-pointer align-middle"
                    />
                  </td>
                )}
                {columns.map((col, i) => {
                  const isStickyLast = stickyLastColumn && i === columns.length - 1
                  return (
                  <td
                    key={col.key}
                    className={`
                      px-3 py-3 text-[var(--md-sys-color-on-surface)]
                      ${nowrap ? 'whitespace-nowrap' : ''}
                      ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                      ${isStickyLast ? `sticky right-0 z-10 border-l border-[var(--md-sys-color-outline-variant)] ${stickyCellBg} ${stickyCellHover}` : ''}
                    `}
                  >
                    {col.render(row)}
                  </td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export type { Column }
