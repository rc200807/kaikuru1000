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
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyTitle = 'データがありません',
  emptyDescription,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState(false)

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return
    if (sortKey === col.key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

  const sortedData = useMemo(() => {
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
  }, [data, sortKey, sortDir, columns])

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
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  style={col.width ? { width: col.width } : undefined}
                  className={`
                    text-left px-3 py-3 text-xs font-medium whitespace-nowrap
                    text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider
                    ${col.sortable ? 'cursor-pointer select-none hover:text-[var(--md-sys-color-on-surface)]' : ''}
                    ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                  `}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M8 3.5a.75.75 0 01.75.75v6.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V4.25A.75.75 0 018 3.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map(row => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`
                  border-b border-[var(--md-sys-color-surface-container-high)]
                  ${onRowClick
                    ? 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors'
                    : ''
                  }
                `}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`
                      px-3 py-3 text-[var(--md-sys-color-on-surface)]
                      ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                    `}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export type { Column }
