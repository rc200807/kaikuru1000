import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'
import { parseCsv, buildCsv } from '@/lib/csv-parser'

const COLUMNS: { header: string; required?: boolean }[] = [
  { header: 'ライセンスキー', required: true },
  { header: '開始日' },
  { header: '終了日' },
]

type RowError = { row: number; licenseKey?: string; message: string }

/** GET: CSVテンプレートをダウンロード */
export async function GET() {
  const partner = await requirePartner()
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = COLUMNS.map(c => c.required ? `${c.header}*` : c.header)
  const sample = ['KK-2024-AAAA-1111', '2026-04-01', '']
  const csv = buildCsv([headers, sample])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="license-keys-template.csv"',
    },
  })
}

/** 日付パース: 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY.MM.DD'。空 or 'null' は null。 */
function parseDate(v: string): Date | null | 'invalid' {
  const trimmed = v.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  const m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return 'invalid'
  const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
  const date = new Date(Date.UTC(y, mo, d))
  return isNaN(date.getTime()) ? 'invalid' : date
}

/** POST: CSVをパースしてライセンスキーの開始日・終了日を更新 */
export async function POST(req: NextRequest) {
  const partner = await requirePartner()
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data で送信してください' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
  }

  const csvText = await file.text()
  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'ヘッダー行とデータ行が必要です' }, { status: 400 })
  }

  // ヘッダー解析
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const idxOf: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) idxOf[headerRow[i]] = i

  const missing = COLUMNS.filter(c => c.required && !(c.header in idxOf)).map(c => c.header)
  if (missing.length > 0) {
    return NextResponse.json({ error: `必須列が見つかりません: ${missing.join(', ')}` }, { status: 400 })
  }

  const get = (row: string[], header: string) => {
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  const errors: RowError[] = []
  let updatedCount = 0
  const totalRows = rows.length - 1

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const lineNo = r + 1
    const licenseKey = get(row, 'ライセンスキー')
    const startRaw   = get(row, '開始日')
    const endRaw     = get(row, '終了日')

    if (!licenseKey) { errors.push({ row: lineNo, message: 'ライセンスキーが空です' }); continue }

    const startDate = parseDate(startRaw)
    const endDate   = parseDate(endRaw)
    if (startDate === 'invalid') { errors.push({ row: lineNo, licenseKey, message: `開始日の形式が不正: "${startRaw}"（例: 2026-04-01）` }); continue }
    if (endDate   === 'invalid') { errors.push({ row: lineNo, licenseKey, message: `終了日の形式が不正: "${endRaw}"（例: 2026-04-01）` }); continue }

    try {
      const data: Record<string, unknown> = {}
      // 開始日: CSVに値があれば（null含む）上書き対象
      if (idxOf['開始日'] !== undefined) data.startDate = startDate
      if (idxOf['終了日'] !== undefined) data.endDate   = endDate

      const result = await prisma.licenseKey.updateMany({
        where: { key: licenseKey },
        data,
      })
      if (result.count === 0) {
        errors.push({ row: lineNo, licenseKey, message: `ライセンスキー "${licenseKey}" は存在しません` })
      } else {
        updatedCount++
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ row: lineNo, licenseKey, message: `更新に失敗: ${message}` })
    }
  }

  return NextResponse.json({ totalRows, updatedCount, errorCount: errors.length, errors })
}
