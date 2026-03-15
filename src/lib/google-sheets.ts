import { google } from 'googleapis'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SHEET_NAME = '店舗マスター'

// 読み取り専用（店舗マスター同期用）
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// 読み書き（ライセンスキー書き込み用）
function getWriteAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ライセンスキーをスプレッドシートに追記する
export async function appendLicenseKeysToSheet(keys: string[]): Promise<{ success: boolean; message: string }> {
  if (!keys.length) return { success: true, message: '追加するキーなし' }

  const config = await prisma.googleSheetsConfig.findFirst()
  const rawId = config?.spreadsheetId
  if (!rawId) return { success: false, message: 'スプレッドシートIDが設定されていません' }
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) return { success: false, message: 'サービスアカウントが設定されていません' }

  const spreadsheetId = extractSpreadsheetId(rawId)
  const sheetName = config?.sheetName || 'ライセンスキー'
  const keyColumn = (config?.keyColumn || 'A').toUpperCase()
  const colIndex = keyColumn.charCodeAt(0) - 65 // A→0, B→1 ...

  try {
    const auth = getWriteAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 各キーを正しい列位置に配置した行配列を作成
    const values = keys.map(k => {
      const row = Array(colIndex + 1).fill('')
      row[colIndex] = k
      return row
    })

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    })

    return { success: true, message: `${keys.length}件をスプレッドシートに追加しました` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message }
  }
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
  deleted: number
  deactivated: number
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
    return { success: false, message: 'スプレッドシートIDが設定されていません。店舗管理画面から設定してください。', synced: 0, deleted: 0, deactivated: 0 }
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
      return { success: true, message: 'No data found in spreadsheet', synced: 0, deleted: 0, deactivated: 0 }
    }

    // スプレッドシートのセルに入っている無意味な値（ダッシュ記号のみ等）を空文字に正規化
    function cleanField(val: string | undefined): string {
      const v = (val || '').trim()
      // 「—」「-」「−」「ー」「―」「–」や空白のみ → 住所等として無効
      if (/^[\s\-\u2014\u2013\u2015\u2212\u30FC\uFF0D]*$/.test(v)) return ''
      return v
    }

    const storeRows: StoreRow[] = rows.map((row, index) => ({
      rowId: `row_${index + 2}`,
      code:        (row[colIdx(colMap.code        || 'A')] || '').trim(),
      name:        (row[colIdx(colMap.name        || 'B')] || '').trim(),
      prefecture:  cleanField(row[colIdx(colMap.prefecture  || 'C')]),
      address:     cleanField(row[colIdx(colMap.address     || 'D')]),
      phone:       cleanField(row[colIdx(colMap.phone       || 'E')]),
      email:       cleanField(row[colIdx(colMap.email       || 'F')]),
    })).filter(row => row.code && row.name)

    let synced = 0
    let deleted = 0
    let deactivated = 0

    // スプレッドシートに存在するコードセット
    const sheetCodes = new Set(storeRows.map(r => r.code))

    for (const storeRow of storeRows) {
      await prisma.store.upsert({
        where: { code: storeRow.code },
        update: {
          name: storeRow.name,
          prefecture: storeRow.prefecture || null,
          address: storeRow.address || null,
          phone: storeRow.phone || null,
          email: storeRow.email || null,
          sheetRowId: storeRow.rowId,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          code: storeRow.code,
          name: storeRow.name,
          prefecture: storeRow.prefecture || null,
          address: storeRow.address || null,
          phone: storeRow.phone || null,
          email: storeRow.email || null,
          sheetRowId: storeRow.rowId,
          // 新規店舗ごとにランダムな初期パスワードを生成（共通デフォルトパスワードを廃止）
          password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        },
      })
      synced++
    }

    // スプレッドシートにない店舗を DB から検索
    const obsoleteStores = await prisma.store.findMany({
      where: { code: { notIn: Array.from(sheetCodes) } },
      select: {
        id: true,
        code: true,
        _count: {
          select: { visitSchedules: true, customers: true, members: true },
        },
      },
    })

    for (const store of obsoleteStores) {
      const hasVisits = store._count.visitSchedules > 0
      const hasCustomers = store._count.customers > 0

      if (!hasVisits && !hasCustomers) {
        // 依存データなし → StoreMember を削除してから Store を削除
        await prisma.$transaction([
          prisma.storeMember.deleteMany({ where: { storeId: store.id } }),
          prisma.store.delete({ where: { id: store.id } }),
        ])
        deleted++
      } else {
        // 訪問記録または顧客が存在 → isActive=false に設定して履歴を保持
        // User.storeId は nullable なので null にして担当店舗の紐付けを解除
        // StoreMember は削除（店舗ログイン不要になるため）
        await prisma.$transaction([
          prisma.user.updateMany({
            where: { storeId: store.id },
            data: { storeId: null },
          }),
          prisma.storeMember.deleteMany({ where: { storeId: store.id } }),
          prisma.store.update({
            where: { id: store.id },
            data: { isActive: false, updatedAt: new Date() },
          }),
        ])
        deactivated++
      }
    }

    // 同期ログ記録
    const logParts = [`${synced}件を同期`]
    if (deleted > 0) logParts.push(`${deleted}件を削除`)
    if (deactivated > 0) logParts.push(`${deactivated}件を無効化`)
    await prisma.syncLog.create({
      data: {
        type: 'stores',
        status: 'success',
        message: logParts.join(', '),
      },
    })

    return {
      success: true,
      message: logParts.join(', '),
      synced,
      deleted,
      deactivated,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await prisma.syncLog.create({
      data: {
        type: 'stores',
        status: 'error',
        message,
      },
    })

    return { success: false, message, synced: 0, deleted: 0, deactivated: 0 }
  }
}
