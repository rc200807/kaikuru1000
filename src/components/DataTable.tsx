'use client'

import { useState, useMemo } from 'react'
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

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className={`overflow-x-auto thin-scrollbar ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col)}
                style={col.width ? { width: col.width } : undefined}
                className={`
                  text-left px-3 py-3 text-xs font-medium
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
  )
}

export type { Column }
