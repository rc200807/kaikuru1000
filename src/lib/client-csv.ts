// クライアント側CSV生成・ダウンロード（全件がメモリにある小規模一覧向け）。
// BOM付きUTF-8（Excel互換）。サーバー生成が必要な大規模一覧は各エクスポートAPIを使うこと。

function escapeCsvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function downloadCsv(filename: string, header: string[], rows: string[][]): void {
  const lines = [header, ...rows].map(row => row.map(escapeCsvCell).join(','))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** JSTの今日を YYYYMMDD で返す（ファイル名用） */
export function csvDateStamp(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '')
}
