import { google } from 'googleapis'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { autoSyncStoreRows, autoSyncStoreRowsDeleted } from './sheet-sync'

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

// スプレッドシート作成 + 共有用（Sheets + Drive scope）
function getCreateAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file', // サービスアカウントが作成したファイルのみ操作
    ],
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

// お問い合わせシート列ヘッダー（並び順がそのまま列順）
const INQUIRY_SHEET_HEADERS = [
  '受付日時',
  '店舗コード',
  '店舗名',
  '氏名',
  'フリガナ',
  '電話',
  'メール',
  '郵便番号',
  '住所',
  '申込み内容',
  '相談内容',
  'ステータス',
  '買取品目',
]

type InquiryForSheet = {
  createdAt: Date | string
  store: { code: string | null; name: string | null } | null
  name: string
  furigana: string | null
  phone: string | null
  email: string | null
  postalCode: string | null
  address: string | null
  inquiryType: string | null
  details: string | null
  status: string | null
  purchaseMemos?: { title: string | null }[]
}

function formatInquiryRow(inq: InquiryForSheet): string[] {
  const dt = typeof inq.createdAt === 'string' ? new Date(inq.createdAt) : inq.createdAt
  const formatted = isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).format(dt)
  const STATUS_LABEL: Record<string, string> = { new: '新規', contacted: '対応中', completed: '完了' }
  const items = (inq.purchaseMemos ?? []).map(m => m.title ?? '').filter(Boolean).join(' / ')
  return [
    formatted,
    inq.store?.code ?? '',
    inq.store?.name ?? '',
    inq.name ?? '',
    inq.furigana ?? '',
    inq.phone ?? '',
    inq.email ?? '',
    inq.postalCode ?? '',
    inq.address ?? '',
    inq.inquiryType ?? '',
    inq.details ?? '',
    inq.status ? (STATUS_LABEL[inq.status] ?? inq.status) : '',
    items,
  ]
}

// ヘッダー行が存在しなければ追加する
async function ensureInquiryHeader(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
): Promise<void> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:M1`,
  })
  const row = res.data.values?.[0] ?? []
  if (row.length === 0 || row[0] !== INQUIRY_SHEET_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [INQUIRY_SHEET_HEADERS] },
    })
  }
}

async function appendInquiryRows(rows: string[][]): Promise<{ success: boolean; message: string; appended: number }> {
  if (!rows.length) return { success: true, message: '追記対象なし', appended: 0 }

  const config = await prisma.googleSheetsConfig.findFirst()
  const rawId = config?.inquirySpreadsheetId
  if (!rawId) return { success: false, message: 'お問い合わせ用スプレッドシートIDが設定されていません', appended: 0 }
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'サービスアカウントが設定されていません', appended: 0 }
  }

  const spreadsheetId = extractSpreadsheetId(rawId)
  const sheetName = config?.inquirySheetName || 'お問い合わせ'

  try {
    const auth = getWriteAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    await ensureInquiryHeader(sheets, spreadsheetId, sheetName)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    })
    return { success: true, message: `${rows.length}件をスプレッドシートに追記しました`, appended: rows.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message, appended: 0 }
  }
}

// 単一のお問い合わせをシートへ追記（自動記録用）
export async function appendInquiryToSheet(inquiryId: string): Promise<{ success: boolean; message: string }> {
  const inq = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    include: { store: true, purchaseMemos: true },
  })
  if (!inq) return { success: false, message: 'お問い合わせが見つかりません' }
  const { appended: _appended, ...rest } = await appendInquiryRows([formatInquiryRow(inq as InquiryForSheet)])
  return rest
}

// 複数のお問い合わせをシートへ追記（エクスポート用）
export async function appendInquiriesToSheet(inquiryIds?: string[]): Promise<{ success: boolean; message: string; appended: number }> {
  const inquiries = await prisma.inquiry.findMany({
    where: inquiryIds && inquiryIds.length > 0 ? { id: { in: inquiryIds } } : {},
    include: { store: true, purchaseMemos: true },
    orderBy: { createdAt: 'asc' },
  })
  const rows = inquiries.map(i => formatInquiryRow(i as InquiryForSheet))
  return appendInquiryRows(rows)
}

// =============================================================
// 店舗別 問い合わせ記録スプレッドシート
// =============================================================

/** 店舗別ヘッダー（店舗自身の問い合わせなので「店舗コード/店舗名」列は省略） */
const STORE_INQUIRY_HEADERS = [
  '受付日時',
  '氏名',
  'フリガナ',
  '電話',
  'メール',
  '郵便番号',
  '住所',
  '申込み内容',
  '相談内容',
  'ステータス',
  '買取品目',
]

function formatStoreInquiryRow(inq: InquiryForSheet): string[] {
  const dt = typeof inq.createdAt === 'string' ? new Date(inq.createdAt) : inq.createdAt
  const formatted = isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).format(dt)
  const STATUS_LABEL: Record<string, string> = { new: '新規', contacted: '対応中', completed: '完了' }
  const items = (inq.purchaseMemos ?? []).map(m => m.title ?? '').filter(Boolean).join(' / ')
  return [
    formatted,
    inq.name ?? '',
    inq.furigana ?? '',
    inq.phone ?? '',
    inq.email ?? '',
    inq.postalCode ?? '',
    inq.address ?? '',
    inq.inquiryType ?? '',
    inq.details ?? '',
    inq.status ? (STATUS_LABEL[inq.status] ?? inq.status) : '',
    items,
  ]
}

/**
 * 店舗用の新規スプレッドシートを作成し、ヘッダー行を書き込み、
 * 指定メールアドレスに編集権限を付与する。
 * 返り値: { spreadsheetId, url, sharedEmails }
 */
export async function createStoreInquirySpreadsheet(params: {
  storeName: string
  storeCode: string
  shareEmails: string[]
}): Promise<{ success: boolean; message: string; spreadsheetId?: string; url?: string; sharedEmails?: string[] }> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'Googleサービスアカウントが設定されていません（GOOGLE_SHEETS_CLIENT_EMAIL）' }
  }

  try {
    const auth = getCreateAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const drive  = google.drive({ version: 'v3', auth })

    // 1) スプレッドシート作成
    const title = `【買いクル】${params.storeName}（${params.storeCode}） 問い合わせ記録`
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title, locale: 'ja_JP', timeZone: 'Asia/Tokyo' },
        sheets: [{ properties: { title: '問い合わせ' } }],
      },
      fields: 'spreadsheetId,spreadsheetUrl',
    })

    const spreadsheetId = createRes.data.spreadsheetId
    const url = createRes.data.spreadsheetUrl
    if (!spreadsheetId || !url) {
      return { success: false, message: 'スプレッドシートの作成結果からIDを取得できませんでした' }
    }

    // 2) ヘッダー行を書き込み + 太字化
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: '問い合わせ!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [STORE_INQUIRY_HEADERS] },
    })
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        ],
      },
    })

    // 3) 共有許可を付与
    const sharedEmails: string[] = []
    for (const rawEmail of params.shareEmails) {
      const email = rawEmail.trim()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          sendNotificationEmail: true,
          requestBody: { type: 'user', role: 'writer', emailAddress: email },
        })
        sharedEmails.push(email)
      } catch (err) {
        console.error(`[google-sheets] 共有失敗 (${email}):`, err)
      }
    }

    return { success: true, message: 'スプレッドシートを発行しました', spreadsheetId, url, sharedEmails }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[google-sheets] createStoreInquirySpreadsheet 失敗:', message)
    return { success: false, message }
  }
}

/** 既存スプレッドシートに新しいメールアドレスを編集権限で追加 */
export async function shareStoreInquirySpreadsheet(spreadsheetId: string, emails: string[]): Promise<{ success: boolean; message: string; sharedEmails: string[] }> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'サービスアカウント未設定', sharedEmails: [] }
  }
  try {
    const auth = getCreateAuth()
    const drive = google.drive({ version: 'v3', auth })
    const sharedEmails: string[] = []
    for (const rawEmail of emails) {
      const email = rawEmail.trim()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          sendNotificationEmail: true,
          requestBody: { type: 'user', role: 'writer', emailAddress: email },
        })
        sharedEmails.push(email)
      } catch (err) {
        console.error(`[google-sheets] 共有失敗 (${email}):`, err)
      }
    }
    return { success: true, message: `${sharedEmails.length}件のメールに共有しました`, sharedEmails }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), sharedEmails: [] }
  }
}

/** 店舗別シートに1件の問い合わせを追記（ベストエフォート） */
export async function appendInquiryToStoreSheet(spreadsheetId: string, inquiryId: string): Promise<{ success: boolean; message: string }> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'サービスアカウント未設定' }
  }
  const inq = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    include: { store: true, purchaseMemos: true },
  })
  if (!inq) return { success: false, message: 'お問い合わせが見つかりません' }

  try {
    const auth = getWriteAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '問い合わせ!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [formatStoreInquiryRow(inq as InquiryForSheet)] },
    })
    return { success: true, message: '追記しました' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[google-sheets] appendInquiryToStoreSheet 失敗:', message)
    return { success: false, message }
  }
}

/** 店舗の既存問い合わせを全件、シートに書き込む（発行時バックフィル用） */
export async function backfillStoreInquiriesToSheet(spreadsheetId: string, storeId: string): Promise<{ success: boolean; message: string; appended: number }> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'サービスアカウント未設定', appended: 0 }
  }
  const inquiries = await prisma.inquiry.findMany({
    where: { storeId },
    include: { store: true, purchaseMemos: true },
    orderBy: { createdAt: 'asc' },
  })
  if (inquiries.length === 0) return { success: true, message: '既存の問い合わせはありません', appended: 0 }

  try {
    const auth = getWriteAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const rows = inquiries.map(i => formatStoreInquiryRow(i as InquiryForSheet))
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '問い合わせ!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    })
    return { success: true, message: `${rows.length}件をバックフィルしました`, appended: rows.length }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), appended: 0 }
  }
}

interface StoreRow {
  rowId: string
  code: string
  name: string
  prefecture: string
  address: string
  phone: string
  email: string
  storeStatus?: string
  openingDate?: string
  closingDate?: string
  googleBusinessUrl?: string
  oikuraPageUrl?: string
  bankInfo?: string
  invoiceNumber?: string
  antiquePermitNumber?: string
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

  console.log('[StoreSync] カラムマッピング:', JSON.stringify(colMap))

  // 列文字をインデックスに変換（A→0, B→1, ..., Z→25, AA→26, AB→27, ..., AM→38）
  function colIdx(letter: string): number {
    const s = letter.toUpperCase()
    let idx = 0
    for (let i = 0; i < s.length; i++) {
      idx = idx * 26 + (s.charCodeAt(i) - 64)
    }
    return idx - 1 // 0-based
  }

  // インデックスを列文字に変換（0→A, 25→Z, 26→AA, 38→AM）
  function idxToCol(idx: number): string {
    let col = ''
    let n = idx + 1 // 1-based
    while (n > 0) {
      n--
      col = String.fromCharCode(65 + (n % 26)) + col
      n = Math.floor(n / 26)
    }
    return col
  }

  // 必要な列の最大インデックスを求めて取得範囲を決める
  const indices = Object.values(colMap).map((l: any) => colIdx(l))
  const maxCol = Math.max(...indices)
  const endCol = idxToCol(maxCol)

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
      // リテラル文字列 "\u2014" 等のUnicodeエスケープ表記もクリーン
      if (/^(\\u[0-9a-fA-F]{4})+$/.test(v)) return ''
      // 「—」「-」「−」「ー」「―」「–」や空白のみ → 住所等として無効
      if (/^[\s\-\u2014\u2013\u2015\u2212\u30FC\uFF0D]*$/.test(v)) return ''
      return v
    }

    const storeRows: StoreRow[] = rows.map((row, index) => {
      const base: StoreRow = {
        rowId: `row_${index + 2}`,
        code:        (row[colIdx(colMap.code        || 'A')] || '').trim(),
        name:        (row[colIdx(colMap.name        || 'B')] || '').trim(),
        prefecture:  cleanField(row[colIdx(colMap.prefecture  || 'C')]),
        address:     cleanField(row[colIdx(colMap.address     || 'D')]),
        phone:       cleanField(row[colIdx(colMap.phone       || 'E')]),
        email:       cleanField(row[colIdx(colMap.email       || 'F')]),
      }
      // 新フィールド（列がマッピングされている場合のみ取得）
      if (colMap.storeStatus)         base.storeStatus         = cleanField(row[colIdx(colMap.storeStatus)])
      if (colMap.openingDate)         base.openingDate         = cleanField(row[colIdx(colMap.openingDate)])
      if (colMap.closingDate)         base.closingDate         = cleanField(row[colIdx(colMap.closingDate)])
      if (colMap.googleBusinessUrl)   base.googleBusinessUrl   = cleanField(row[colIdx(colMap.googleBusinessUrl)])
      if (colMap.oikuraPageUrl)       base.oikuraPageUrl       = cleanField(row[colIdx(colMap.oikuraPageUrl)])
      if (colMap.bankInfo)            base.bankInfo            = cleanField(row[colIdx(colMap.bankInfo)])
      if (colMap.invoiceNumber)       base.invoiceNumber       = cleanField(row[colIdx(colMap.invoiceNumber)])
      if (colMap.antiquePermitNumber) base.antiquePermitNumber = cleanField(row[colIdx(colMap.antiquePermitNumber)])
      return base
    }).filter(row => row.code && row.name)

    // デバッグ: 最初の3件のデータをログ出力
    console.log('[StoreSync] 取得範囲:', `${sheetName}!A2:${endCol}1000`)
    console.log('[StoreSync] 最初の3件:', storeRows.slice(0, 3).map(r => ({ code: r.code, name: r.name, address: r.address || '(空)' })))

    let synced = 0
    let deleted = 0
    let deactivated = 0

    // スプレッドシートに存在するコードセット
    const sheetCodes = new Set(storeRows.map(r => r.code))

    for (const storeRow of storeRows) {
      // 新フィールドのデータを構築（マッピング設定済みの項目のみ）
      const extraData: Record<string, any> = {}
      if (storeRow.storeStatus !== undefined)         extraData.storeStatus         = storeRow.storeStatus || null
      if (storeRow.googleBusinessUrl !== undefined)    extraData.googleBusinessUrl   = storeRow.googleBusinessUrl || null
      if (storeRow.oikuraPageUrl !== undefined)        extraData.oikuraPageUrl       = storeRow.oikuraPageUrl || null
      if (storeRow.bankInfo !== undefined)             extraData.bankInfo            = storeRow.bankInfo || null
      if (storeRow.invoiceNumber !== undefined)        extraData.invoiceNumber       = storeRow.invoiceNumber || null
      if (storeRow.antiquePermitNumber !== undefined)  extraData.antiquePermitNumber = storeRow.antiquePermitNumber || null
      if (storeRow.openingDate !== undefined && storeRow.openingDate) {
        try { extraData.openingDate = new Date(storeRow.openingDate) } catch {}
      }
      if (storeRow.closingDate !== undefined && storeRow.closingDate) {
        try { extraData.closingDate = new Date(storeRow.closingDate) } catch {}
      }

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
          ...extraData,
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
          ...extraData,
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

    // 実際に削除した店舗コード（店舗情報シートからも行を消すために控える）
    const deletedCodes: string[] = []

    for (const store of obsoleteStores) {
      const hasVisits = store._count.visitSchedules > 0
      const hasCustomers = store._count.customers > 0

      if (!hasVisits && !hasCustomers) {
        // 依存データなし → StoreMember を削除してから Store を削除
        await prisma.$transaction([
          prisma.storeMember.deleteMany({ where: { storeId: store.id } }),
          prisma.store.delete({ where: { id: store.id } }),
        ])
        deletedCodes.push(store.code)
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

    // 店舗情報シート（双方向同期側）にも削除・更新を反映する。
    // こちらは旧「店舗マスター」とは別のシートなので、行が取り残されないよう明示的に消す。
    if (deletedCodes.length > 0) {
      await autoSyncStoreRowsDeleted(deletedCodes)
    }
    const touchedCodes = storeRows.map(r => r.code)
    if (touchedCodes.length > 0) {
      await autoSyncStoreRows(touchedCodes)
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
      message: `${logParts.join(', ')}（マッピング: 住所=${colMap.address || 'D'}列）`,
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
