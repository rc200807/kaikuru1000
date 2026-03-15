import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input
}

// シートのヘッダー行（1行目）を取得する
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawId = searchParams.get('spreadsheetId') || ''
  const sheetName = searchParams.get('sheetName') || '店舗マスター'

  if (!rawId) {
    return NextResponse.json({ error: 'spreadsheetId is required' }, { status: 400 })
  }

  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Google Sheets API credentials not configured' }, { status: 500 })
  }

  const spreadsheetId = extractSpreadsheetId(rawId)

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 1行目のみ取得
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    })

    const row = response.data.values?.[0] ?? []

    // インデックスを列文字に変換（0→A, 25→Z, 26→AA, 38→AM）
    function idxToCol(idx: number): string {
      let col = ''
      let n = idx + 1
      while (n > 0) {
        n--
        col = String.fromCharCode(65 + (n % 26)) + col
        n = Math.floor(n / 26)
      }
      return col
    }

    // カラム情報を返す: [{index: 0, letter: "A", header: "店舗コード"}, ...]
    const columns = row.map((header: string, i: number) => ({
      index: i,
      letter: idxToCol(i), // A, B, ..., Z, AA, AB, ..., AM, ...
      header: header || `列${i + 1}`,
    }))

    return NextResponse.json({ columns, sheetName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
