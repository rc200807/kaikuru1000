'use client'

// ソート可能な集計テーブル
import { useState, useMemo, useEffect } from 'react'
import { fmtYenFull, fmtNum, fmtPct } from '@/lib/analytics/format'

export type StatColumn = {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: 'yen' | 'count' | 'pct' | 'date' | 'text'
  sortable?: boolean
}

type Props = {
  columns: StatColumn[]
  rows: Record<string, unknown>[]
  /** 初期ソートキー（降順） */
  defaultSortKey?: string
  maxRows?: number
  /** 指定するとページネーション（1ページあたり pageSize 件）を表示。maxRows より優先 */
  pageSize?: number
  emptyText?: string
}

function formatCell(value: unknown, format?: StatColumn['format']): string {
  if (value == null) return '—'
  switch (format) {
    case 'yen': return fmtYenFull(Number(value))
    case 'count': return fmtNum(Number(value))
    case 'pct': return fmtPct(Number(value), 1)
    case 'date': {
      const d = new Date(String(value))
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
    }
    default: return String(value)
  }
}

export default function StatTable({ columns, rows, defaultSortKey, maxRows, pageSize, emptyText = 'データがありません' }: Props) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null)
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDesc ? bv - av : av - bv
      return sortDesc ? String(bv ?? '').localeCompare(String(av ?? '')) : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [rows, sortKey, sortDesc])

  // 行数・並び替えが変わったら1ページ目へ戻す
  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  useEffect(() => { setPage(1) }, [rows, sortKey, sortDesc])

  const visible = pageSize
    ? sorted.slice((page - 1) * pageSize, page * pageSize)
    : (maxRows ? sorted.slice(0, maxRows) : sorted)

  if (rows.length === 0) {
    return <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-variant)]">{emptyText}</p>
  }

  const toggleSort = (col: StatColumn) => {
    if (col.sortable === false) return
    if (sortKey === col.key) setSortDesc(v => !v)
    else { setSortKey(col.key); setSortDesc(true) }
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col)}
                className={`py-2 px-1.5 font-medium text-[11px] text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.sortable === false ? '' : 'cursor-pointer select-none hover:text-[var(--md-sys-color-on-surface)]'}`}
              >
                {col.label}
                {sortKey === col.key && <span className="ml-0.5">{sortDesc ? '↓' : '↑'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i} className="border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`py-2 px-1.5 whitespace-nowrap tabular-nums ${col.align === 'right' ? 'text-right' : 'text-left'} text-[var(--md-sys-color-on-surface)]`}
                >
                  {formatCell(row[col.key], col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pageSize && sorted.length > pageSize && (
        <div className="flex items-center justify-center gap-3 pt-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="text-xs px-3 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] disabled:opacity-40 text-[var(--md-sys-color-on-surface)]"
          >前へ</button>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
            {page} / {pageCount}（全{sorted.length.toLocaleString()}件）
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            className="text-xs px-3 py-1 rounded-lg border border-[var(--md-sys-color-outline-variant)] disabled:opacity-40 text-[var(--md-sys-color-on-surface)]"
          >次の{pageSize}件</button>
        </div>
      )}
      {!pageSize && maxRows && rows.length > maxRows && (
        <p className="text-[10px] text-center pt-2 text-[var(--md-sys-color-on-surface-variant)]">上位{maxRows}件を表示（全{rows.length}件）</p>
      )}
    </div>
  )
}
