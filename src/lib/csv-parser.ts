/**
 * シンプルなCSVパーサー（RFC 4180準拠の主要部分）
 * - ダブルクォートで囲まれたフィールド対応（カンマ・改行を含めるため）
 * - エスケープ "" → " 対応
 * - CRLF / LF / CR の行末対応
 * - BOM 自動除去
 */
export function parseCsv(input: string): string[][] {
  // BOM 除去
  if (input.charCodeAt(0) === 0xFEFF) input = input.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // エスケープされたダブルクォート
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      field = ''
      // CRLF を1回として処理
      if (ch === '\r' && input[i + 1] === '\n') i++
      i++
      // 空行はスキップ
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      continue
    }
    field += ch
    i++
  }
  // 最後の field / row を flush
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

/**
 * CSVの1セルをエスケープ（カンマ・改行・クォート含むなら "" でラップ）
 */
export function csvEscape(value: string): string {
  if (value === '' || value == null) return ''
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * 配列 → CSV 文字列。BOM付きでExcel互換。
 */
export function buildCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const csv = rows
    .map(row => row.map(c => csvEscape(c == null ? '' : String(c))).join(','))
    .join('\r\n')
  return '﻿' + csv
}
