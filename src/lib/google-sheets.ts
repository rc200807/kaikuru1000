import { google } from 'googleapis'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SHEET_NAME = '店舗マスター'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// スプレッドシートURLからIDを抽出
function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input
}

interface StoreRow {
  rowId: string
  code: string
  name: string
  prefecture: string
  address: string
  phone: string
  email: string
}

export async function syncStoresFromGoogleSheets(): Promise<{
  success: boolean
  message: string
  synced: number
}> {
  // DBからスプレッドシートIDとカラムマッピングを取得
  const config = await prisma.googleSheetsConfig.findFirst()
  const rawId = config?.storeSpreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  const SPREADSHEET_ID = rawId ? extractSpreadsheetId(rawId) : null
  const sheetName = config?.storeSheetName || SHEET_NAME

  // カラムマッピング（デフォルト: A=コード, B=名前, C=都道府県, D=住所, E=電話, F=メール）
  const colMap = config?.storeColumnMapping
    ? JSON.parse(config.storeColumnMapping)
    : { code: 'A', name: 'B', prefecture: 'C', address: 'D', phone: 'E', email: 'F' }

  // 列文字をインデックスに変換（A→0, B→1, ...）
  function colIdx(letter: string): number {
    return letter.toUpperCase().charCodeAt(0) - 65
  }

  // 必要な列の最大インデックスを求めて取得範囲を決める
  const indices = Object.values(colMap).map((l: any) => colIdx(l))
  const maxCol = Math.max(...indices)
  const endCol = String.fromCharCode(65 + maxCol)

  if (!SPREADSHEET_ID || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'スプレッドシートIDが設定されていません。店舗管理画面から設定してください。', synced: 0 }
  }

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A2:${endCol}1000`, // ヘッダー行をスキップ
    })

    const rows = response.data.values
    if (!rows || rows.length === 0) {
      return { success: true, message: 'No data found in spreadsheet', synced: 0 }
    }

    const storeRows: StoreRow[] = rows.map((row, index) => ({
      rowId: `row_${index + 2}`,
      code:        row[colIdx(colMap.code        || 'A')] || '',
      name:        row[colIdx(colMap.name        || 'B')] || '',
      prefecture:  row[colIdx(colMap.prefecture  || 'C')] || '',
      address:     row[colIdx(colMap.address     || 'D')] || '',
      phone:       row[colIdx(colMap.phone       || 'E')] || '',
      email:       row[colIdx(colMap.email       || 'F')] || '',
    })).filter(row => row.code && row.name)

    let synced = 0

    for (const storeRow of storeRows) {
      await prisma.store.upsert({
        where: { code: storeRow.code },
        update: {
          name: storeRow.name,
          prefecture: storeRow.prefecture,
          address: storeRow.address,
          phone: storeRow.phone,
          email: storeRow.email || null,
          sheetRowId: storeRow.rowId,
          updatedAt: new Date(),
        },
        create: {
          code: storeRow.code,
          name: storeRow.name,
          prefecture: storeRow.prefecture,
          address: storeRow.address,
          phone: storeRow.phone,
          email: storeRow.email || null,
          sheetRowId: storeRow.rowId,
          // 新規店舗ごとにランダムな初期パスワードを生成（共通デフォルトパスワードを廃止）
          password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        },
      })
      synced++
    }

    // 同期ログ記録
    await prisma.syncLog.create({
      data: {
        type: 'stores',
        status: 'success',
        message: `Synced ${synced} stores from Google Sheets`,
      },
    })

    return { success: true, message: `Successfully synced ${synced} stores`, synced }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await prisma.syncLog.create({
      data: {
        type: 'stores',
        status: 'error',
        message,
      },
    })

    return { success: false, message, synced: 0 }
  }
}
