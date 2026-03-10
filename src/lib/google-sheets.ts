import { google } from 'googleapis'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
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
  if (!SPREADSHEET_ID || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'Google Sheets API credentials not configured', synced: 0 }
  }

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:F1000`, // ヘッダー行をスキップ
    })

    const rows = response.data.values
    if (!rows || rows.length === 0) {
      return { success: true, message: 'No data found in spreadsheet', synced: 0 }
    }

    // カラム: A=店舗コード, B=店舗名, C=都道府県, D=住所, E=電話番号, F=メールアドレス
    const storeRows: StoreRow[] = rows.map((row, index) => ({
      rowId: `row_${index + 2}`,
      code: row[0] || '',
      name: row[1] || '',
      prefecture: row[2] || '',
      address: row[3] || '',
      phone: row[4] || '',
      email: row[5] || '',
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
