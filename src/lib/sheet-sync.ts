// 店舗情報・運営者情報 ⇔ Googleスプレッドシート 双方向同期エンジン。
//
// エクスポート（シートへ出力）:
//   - シート（タブ）が無ければ作成し、ヘッダー行が無ければシステム側の列定義で作成する。
//   - 既存ヘッダーがある場合は列順を尊重し、不足するシステム列は右端に追加。
//     システム定義に無い独自列は、キー（店舗コード/運営者ID）で突合して値を持ち越す。
//   - 行順は既存シートの並びを保ち、新規レコードは末尾に追加。DBに無い行は削除される。
//
// インポート（シートから取込）:
//   - キー列（店舗コード/運営者ID）で突合して更新。キー空欄の行は新規作成し、
//     発行されたキーをシートに書き戻す（再取込での重複作成を防止）。
//   - シートに存在しない列は変更しない。DB側の削除は行わない（安全側）。
import { google, type sheets_v4 } from 'googleapis'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from './prisma'
import { STORE_CSV_COLUMNS, storeStatusValueFromCell } from './store-csv'
import { storeStatusLabel } from './store-status'
import { storeServicesLabel, storeServicesValueFromCell } from './store-services'
import {
  OPERATOR_SHEET_COLUMNS,
  entityTypeFromCell,
  entityTypeLabel,
  corporatePrefixFromCell,
  boolFromCell,
  operatorServicesFromCell,
  operatorServicesLabel,
} from './operator-sheet'
import { operatorInheritedValues, syncStoresForOperator } from './operator-store-sync'
import {
  CUSTOMER_SHEET_COLUMNS,
  customerTypesFromCell,
  customerTypesLabel,
  activeFromCell,
  normalizePhoneCell,
} from './customer-sheet'
import { stringifyCustomerTypes } from './customer-types'
import { buildUserNameUpdateData } from './name-utils'

export type SheetSyncColumn = { key: string; header: string; kind: string }
/** 1レコード分のシート行データ。key は突合キー（店舗コード / 運営者ID） */
export type RecordRow = { key: string; values: Record<string, string> }
export type RowError = { row: number; key?: string; message: string }
export type ExportResult = { success: boolean; message: string; exported: number; url?: string }
export type ImportResult = {
  success: boolean
  message: string
  totalRows: number
  createdCount: number
  updatedCount: number
  errorCount: number
  errors: RowError[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}

/** A1表記用にシート名をクォート（シングルクォートはエスケープ） */
function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

/** 列インデックス（0始まり）→ 列文字（A, B, ..., AA） */
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

function normHeader(h: string): string {
  return (h || '').trim().replace(/\*+$/, '')
}

/** シート（タブ）の sheetId を取得。存在しなければ createIfMissing に応じて作成 or null */
async function resolveSheetTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  createIfMissing: boolean,
): Promise<number | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' })
  const found = meta.data.sheets?.find(s => s.properties?.title === sheetName)
  if (found) return found.properties?.sheetId ?? null
  if (!createIfMissing) return null
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null
}

async function readAllValues(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetName(sheetName),
  })
  return (res.data.values ?? []).map(row => row.map(cell => (cell == null ? '' : String(cell))))
}

// =============================================================
// 汎用エクスポート
// =============================================================

async function exportRecordsToSheet(params: {
  spreadsheetId: string
  sheetName: string
  columns: SheetSyncColumn[]
  keyColumnKey: string
  records: RecordRow[]
}): Promise<ExportResult> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { success: false, message: 'Googleサービスアカウントが設定されていません（GOOGLE_SHEETS_CLIENT_EMAIL）', exported: 0 }
  }
  const { spreadsheetId, sheetName, columns, keyColumnKey, records } = params

  const sheets = getSheetsClient()
  const sheetId = await resolveSheetTab(sheets, spreadsheetId, sheetName, true)
  const existing = await readAllValues(sheets, spreadsheetId, sheetName)

  const keyHeader = columns.find(c => c.key === keyColumnKey)!.header
  const systemHeaders = columns.map(c => c.header)

  const existingHeaderRaw = existing[0] ?? []
  const existingHeader = existingHeaderRaw.map(normHeader)
  const hasHeader = existingHeader.includes(keyHeader)

  // 最終ヘッダー: 既存ヘッダーの列順を尊重し、不足するシステム列を右端に追加。
  // ヘッダーが無い（キー列が見つからない）場合はシステム定義の順で作成。
  let finalHeader: string[]
  if (hasHeader) {
    finalHeader = [...existingHeaderRaw.map(h => (h == null ? '' : String(h)))]
    const present = new Set(existingHeader)
    for (const h of systemHeaders) {
      if (!present.has(h)) finalHeader.push(h)
    }
  } else {
    finalHeader = [...systemHeaders]
  }
  const finalHeaderNorm = finalHeader.map(normHeader)

  // 既存データ行をキーで索引（独自列の値持ち越しと行順維持に使用）
  const oldRowsByKey = new Map<string, string[]>()
  const oldKeyOrder: string[] = []
  if (hasHeader) {
    const keyIdx = existingHeader.indexOf(keyHeader)
    for (let r = 1; r < existing.length; r++) {
      const k = (existing[r][keyIdx] ?? '').trim()
      if (!k || oldRowsByKey.has(k)) continue
      oldRowsByKey.set(k, existing[r])
      oldKeyOrder.push(k)
    }
  }

  // 行順: 既存シートの並び（現存レコードのみ）→ 新規レコードを末尾に
  const recordByKey = new Map(records.map(rec => [rec.key, rec]))
  const oldKeySet = new Set(oldKeyOrder)
  const orderedKeys: string[] = []
  for (const k of oldKeyOrder) if (recordByKey.has(k)) orderedKeys.push(k)
  for (const rec of records) if (!oldKeySet.has(rec.key)) orderedKeys.push(rec.key)

  const headerKeyByNorm = new Map<string, string>()
  for (const col of columns) headerKeyByNorm.set(col.header, col.key)

  const rows: string[][] = orderedKeys.map(k => {
    const rec = recordByKey.get(k)!
    const oldRow = oldRowsByKey.get(k)
    return finalHeaderNorm.map(h => {
      const colKey = headerKeyByNorm.get(h)
      if (colKey) return rec.values[colKey] ?? ''
      // システム定義に無い独自列: 既存値を持ち越す
      if (oldRow && hasHeader) {
        const oldIdx = existingHeader.indexOf(h)
        if (oldIdx >= 0) return oldRow[oldIdx] ?? ''
      }
      return ''
    })
  })

  // 全消去 → ヘッダー + データを書き込み
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: quoteSheetName(sheetName) })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [finalHeader, ...rows] },
  })

  // ヘッダーを新規作成した場合のみ書式（太字・固定行）を設定
  if (!hasHeader && sheetId != null) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
            { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          ],
        },
      })
    } catch { /* 書式設定は失敗しても本体データには影響しない */ }
  }

  return {
    success: true,
    message: `${rows.length}件をスプレッドシートに出力しました`,
    exported: rows.length,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  }
}

// =============================================================
// 汎用インポート補助
// =============================================================

async function readSheetForImport(params: {
  spreadsheetId: string
  sheetName: string
  keyHeader: string
}): Promise<
  | { ok: true; sheets: sheets_v4.Sheets; rows: string[][]; headerIdx: Record<string, number>; keyIdx: number }
  | { ok: false; message: string }
> {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    return { ok: false, message: 'Googleサービスアカウントが設定されていません（GOOGLE_SHEETS_CLIENT_EMAIL）' }
  }
  const sheets = getSheetsClient()
  const sheetId = await resolveSheetTab(sheets, params.spreadsheetId, params.sheetName, false)
  if (sheetId == null) {
    return { ok: false, message: `シート「${params.sheetName}」が見つかりません。先に「シートへ出力」を実行するか、シート名を確認してください。` }
  }
  const rows = await readAllValues(sheets, params.spreadsheetId, params.sheetName)
  if (rows.length < 1) {
    return { ok: false, message: 'シートが空です。先に「シートへ出力」を実行してください。' }
  }
  const headerIdx: Record<string, number> = {}
  rows[0].forEach((h, i) => {
    const n = normHeader(h)
    if (n && !(n in headerIdx)) headerIdx[n] = i
  })
  const keyIdx = headerIdx[params.keyHeader]
  if (keyIdx === undefined) {
    return { ok: false, message: `キー列「${params.keyHeader}」が見つかりません。先に「シートへ出力」を実行してください。` }
  }
  return { ok: true, sheets, rows, headerIdx, keyIdx }
}

/** 新規作成行に発行したキーをシートへ書き戻す */
async function writeBackKeys(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  keyIdx: number,
  writes: { rowNumber: number; value: string }[],
): Promise<void> {
  if (writes.length === 0) return
  const col = idxToCol(keyIdx)
  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: writes.map(w => ({
          range: `${quoteSheetName(sheetName)}!${col}${w.rowNumber}`,
          values: [[w.value]],
        })),
      },
    })
  } catch (err) {
    console.error('[sheet-sync] キー書き戻しに失敗:', err)
  }
}

function isEmptyRow(row: string[]): boolean {
  return row.every(c => !(c ?? '').trim())
}

// =============================================================
// 店舗情報
// =============================================================

async function getStoreSheetTarget(): Promise<{ spreadsheetId: string; sheetName: string } | null> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.storeInfoSpreadsheetId) return null
  return {
    spreadsheetId: extractSpreadsheetId(config.storeInfoSpreadsheetId),
    sheetName: config.storeInfoSheetName || '店舗情報',
  }
}

const STORE_SELECT = {
  code: true, name: true, storeStatus: true, isActive: true,
  postalCode: true, prefecture: true, address: true, phone: true, email: true,
  contractNotifyEmail: true, calendarInviteEmail: true,
  openingDate: true, closingDate: true,
  googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true,
  bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
  invoiceNumber: true, antiquePermitNumber: true, serviceAreas: true,
  supportedServices: true,
  createdAt: true,
  operator: { select: { name: true } },
  _count: { select: { customers: true } },
} as const

/** 店舗レコードをシート行データに変換する（codes 指定時はその店舗のみ） */
async function buildStoreRecords(codes?: string[]): Promise<RecordRow[]> {
  const stores = await prisma.store.findMany({
    where: codes ? { code: { in: codes } } : undefined,
    orderBy: { code: 'asc' },
    select: STORE_SELECT,
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')
  const day = (d: Date | null) => (d ? new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')

  return stores.map(s => {
    const values: Record<string, string> = {}
    for (const col of STORE_CSV_COLUMNS) {
      switch (col.key) {
        case 'storeStatus':       values[col.key] = storeStatusLabel(s.storeStatus); break
        case 'openingDate':       values[col.key] = ymd(s.openingDate); break
        case 'closingDate':       values[col.key] = ymd(s.closingDate); break
        case 'serviceAreas':      values[col.key] = s.serviceAreas ?? ''; break
        case 'supportedServices': values[col.key] = storeServicesLabel(s.supportedServices); break
        case 'operatorName':      values[col.key] = s.operator?.name ?? ''; break
        case 'isActive':          values[col.key] = s.isActive ? '有効' : '無効'; break
        case 'customerCount':     values[col.key] = String(s._count.customers); break
        case 'createdAt':         values[col.key] = day(s.createdAt); break
        case 'inquiryUrl':        values[col.key] = `${baseUrl}/inquiry/${s.code}`; break
        default: {
          const v = (s as Record<string, unknown>)[col.key]
          values[col.key] = v != null ? String(v) : ''
        }
      }
    }
    return { key: s.code, values }
  })
}

/** 全店舗を設定済みスプレッドシートへ出力する */
export async function exportStoresToSheet(): Promise<ExportResult> {
  const target = await getStoreSheetTarget()
  if (!target) return { success: false, message: '店舗情報用スプレッドシートIDが設定されていません', exported: 0 }

  const records = await buildStoreRecords()

  try {
    return await exportRecordsToSheet({
      ...target,
      columns: STORE_CSV_COLUMNS,
      keyColumnKey: 'code',
      records,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sheet-sync] exportStoresToSheet 失敗:', message)
    return { success: false, message, exported: 0 }
  }
}

function genStorePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(12)).map(b => chars[b % chars.length]).join('')
}
async function genUniqueStoreCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString('hex')
    if (!(await prisma.store.findFirst({ where: { code }, select: { id: true } }))) return code
  }
  return randomBytes(6).toString('hex')
}

/** 設定済みスプレッドシートから店舗情報を取り込む（店舗コードで突合・空欄は新規作成） */
export async function importStoresFromSheet(): Promise<ImportResult> {
  const fail = (message: string): ImportResult =>
    ({ success: false, message, totalRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0, errors: [] })

  const target = await getStoreSheetTarget()
  if (!target) return fail('店舗情報用スプレッドシートIDが設定されていません')

  const codeCol = STORE_CSV_COLUMNS.find(c => c.kind === 'key')!
  const nameCol = STORE_CSV_COLUMNS.find(c => c.key === 'name')!

  let sheetData: Awaited<ReturnType<typeof readSheetForImport>>
  try {
    sheetData = await readSheetForImport({ ...target, keyHeader: codeCol.header })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  if (!sheetData.ok) return fail(sheetData.message)
  const { sheets, rows, headerIdx, keyIdx } = sheetData

  if (!(nameCol.header in headerIdx)) return fail(`必須列「${nameCol.header}」が見つかりません`)

  const get = (row: string[], header: string) => {
    const idx = headerIdx[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  // 既存店舗をコードで一括取得
  const codes = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const c = get(rows[r], codeCol.header)
    if (c) codes.add(c)
  }
  const existing = await prisma.store.findMany({
    where: { code: { in: [...codes] } },
    select: { id: true, code: true, operatorId: true },
  })
  const byCode = new Map(existing.map(s => [s.code, s]))

  // 運営者の継承値をキャッシュ（運営者割当済み店舗は継承項目を運営者の値で上書き）
  const opIds = [...new Set(existing.map(s => s.operatorId).filter((v): v is string => !!v))]
  const inheritedByOp = new Map<string, Record<string, string | null>>()
  if (opIds.length > 0) {
    const ops = await prisma.operator.findMany({
      where: { id: { in: opIds } },
      select: { id: true, bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true, antiquePermitNumber: true, invoiceNumber: true },
    })
    for (const op of ops) inheritedByOp.set(op.id, operatorInheritedValues(op))
  }

  const fieldCols = STORE_CSV_COLUMNS.filter(c => c.kind !== 'key' && c.kind !== 'ref')
  const errors: RowError[] = []
  const keyWrites: { rowNumber: number; value: string }[] = []
  let createdCount = 0
  let updatedCount = 0
  let totalRows = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (isEmptyRow(row)) continue
    totalRows++
    const lineNo = r + 1
    const code = get(row, codeCol.header)

    const data: Record<string, unknown> = {}
    let rowError: string | null = null
    for (const col of fieldCols) {
      // シートに存在しない列は変更しない
      if (!(col.header in headerIdx)) continue
      const raw = get(row, col.header)
      if (col.kind === 'status') {
        const v = storeStatusValueFromCell(raw)
        if (v === undefined) { rowError = `不明なステータス「${raw}」`; break }
        data.storeStatus = v
      } else if (col.kind === 'services') {
        data.supportedServices = storeServicesValueFromCell(raw)
      } else if (col.kind === 'date') {
        if (!raw) { data[col.key] = null; continue }
        const d = new Date(raw)
        if (isNaN(d.getTime())) { rowError = `${col.header}の日付形式が不正「${raw}」`; break }
        data[col.key] = d
      } else if (col.key === 'serviceAreas') {
        if (!raw) { data.serviceAreas = null; continue }
        try { JSON.parse(raw) } catch { rowError = '対応エリア(JSON)の形式が不正です'; break }
        data.serviceAreas = raw
      } else if (col.key === 'email') {
        if (raw && !EMAIL_RE.test(raw)) { rowError = `メール形式が不正「${raw}」`; break }
        data.email = raw || null
      } else {
        data[col.key] = raw || null
      }
    }
    if (rowError) { errors.push({ row: lineNo, key: code || undefined, message: rowError }); continue }

    const name = String(data.name ?? '').trim()
    if (!name) { errors.push({ row: lineNo, key: code || undefined, message: '店舗名が空です' }); continue }

    try {
      if (code) {
        const store = byCode.get(code)
        if (!store) {
          errors.push({ row: lineNo, key: code, message: `店舗コード「${code}」が見つかりません（新規作成する場合はコード欄を空にしてください）` })
          continue
        }
        const finalData = { ...data }
        if (store.operatorId && inheritedByOp.has(store.operatorId)) {
          Object.assign(finalData, inheritedByOp.get(store.operatorId))
        }
        await prisma.store.update({ where: { id: store.id }, data: finalData })
        updatedCount++
      } else {
        const newCode = await genUniqueStoreCode()
        const hashed = await bcrypt.hash(genStorePassword(), 10)
        await prisma.store.create({ data: { ...data, name, code: newCode, password: hashed } as any })
        keyWrites.push({ rowNumber: lineNo, value: newCode })
        createdCount++
      }
    } catch (e) {
      errors.push({ row: lineNo, key: code || undefined, message: `保存に失敗: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // 新規作成分の店舗コードをシートへ書き戻す
  await writeBackKeys(sheets, target.spreadsheetId, target.sheetName, keyIdx, keyWrites)

  return {
    success: true,
    message: `更新${updatedCount}件・新規${createdCount}件を取り込みました${errors.length ? `（エラー${errors.length}件）` : ''}`,
    totalRows, createdCount, updatedCount, errorCount: errors.length, errors,
  }
}

// =============================================================
// 運営者情報
// =============================================================

async function getOperatorSheetTarget(): Promise<{ spreadsheetId: string; sheetName: string } | null> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.operatorSpreadsheetId) return null
  return {
    spreadsheetId: extractSpreadsheetId(config.operatorSpreadsheetId),
    sheetName: config.operatorSheetName || '運営者情報',
  }
}

/** 運営者レコードをシート行データに変換する（ids 指定時はその運営者のみ） */
async function buildOperatorRecords(ids?: string[]): Promise<RecordRow[]> {
  const operators = await prisma.operator.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { stores: true } } },
  })
  const day = (d: Date) => new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })

  return operators.map(op => {
    const values: Record<string, string> = {}
    for (const col of OPERATOR_SHEET_COLUMNS) {
      switch (col.key) {
        case 'id':                values[col.key] = op.id; break
        case 'entityType':        values[col.key] = entityTypeLabel(op.entityType); break
        case 'invoiceRegistered': values[col.key] = op.invoiceRegistered ? 'はい' : 'いいえ'; break
        case 'supportedServices': values[col.key] = operatorServicesLabel(op.supportedServices); break
        case 'storeCount':        values[col.key] = String(op._count.stores); break
        case 'createdAt':         values[col.key] = day(op.createdAt); break
        default: {
          const v = (op as Record<string, unknown>)[col.key]
          values[col.key] = v != null ? String(v) : ''
        }
      }
    }
    return { key: op.id, values }
  })
}

/** 全運営者を設定済みスプレッドシートへ出力する */
export async function exportOperatorsToSheet(): Promise<ExportResult> {
  const target = await getOperatorSheetTarget()
  if (!target) return { success: false, message: '運営者情報用スプレッドシートIDが設定されていません', exported: 0 }

  const records = await buildOperatorRecords()

  try {
    return await exportRecordsToSheet({
      ...target,
      columns: OPERATOR_SHEET_COLUMNS,
      keyColumnKey: 'id',
      records,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sheet-sync] exportOperatorsToSheet 失敗:', message)
    return { success: false, message, exported: 0 }
  }
}

/** 設定済みスプレッドシートから運営者情報を取り込む（運営者IDで突合・空欄は新規作成） */
export async function importOperatorsFromSheet(): Promise<ImportResult> {
  const fail = (message: string): ImportResult =>
    ({ success: false, message, totalRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0, errors: [] })

  const target = await getOperatorSheetTarget()
  if (!target) return fail('運営者情報用スプレッドシートIDが設定されていません')

  const keyCol = OPERATOR_SHEET_COLUMNS.find(c => c.kind === 'key')!

  let sheetData: Awaited<ReturnType<typeof readSheetForImport>>
  try {
    sheetData = await readSheetForImport({ ...target, keyHeader: keyCol.header })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  if (!sheetData.ok) return fail(sheetData.message)
  const { sheets, rows, headerIdx, keyIdx } = sheetData

  const get = (row: string[], header: string) => {
    const idx = headerIdx[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  // 既存運営者をIDで一括取得
  const ids = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const v = get(rows[r], keyCol.header)
    if (v) ids.add(v)
  }
  const existing = await prisma.operator.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  })
  const existingIds = new Set(existing.map(o => o.id))

  const fieldCols = OPERATOR_SHEET_COLUMNS.filter(c => c.kind !== 'key' && c.kind !== 'ref')
  const errors: RowError[] = []
  const keyWrites: { rowNumber: number; value: string }[] = []
  const touchedOperatorIds: string[] = []
  let createdCount = 0
  let updatedCount = 0
  let totalRows = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (isEmptyRow(row)) continue
    totalRows++
    const lineNo = r + 1
    const id = get(row, keyCol.header)

    const data: Record<string, unknown> = {}
    let rowError: string | null = null
    for (const col of fieldCols) {
      // シートに存在しない列は変更しない
      if (!(col.header in headerIdx)) continue
      const raw = get(row, col.header)
      if (col.kind === 'entity') {
        const v = entityTypeFromCell(raw)
        if (v === undefined) { rowError = `会社形態が不正「${raw}」（"法人" または "個人事業主"）`; break }
        data.entityType = v
      } else if (col.kind === 'prefix') {
        const v = corporatePrefixFromCell(raw)
        if (v === undefined) { rowError = `法人種別が候補に含まれません「${raw}」`; break }
        data.corporatePrefix = v
      } else if (col.kind === 'bool') {
        data[col.key] = raw === '' ? false : boolFromCell(raw)
      } else if (col.kind === 'services') {
        data.supportedServices = operatorServicesFromCell(raw)
      } else if (col.kind === 'email') {
        if (raw && !EMAIL_RE.test(raw)) { rowError = `メール形式が不正「${raw}」`; break }
        data[col.key] = raw || null
      } else {
        data[col.key] = raw || null
      }
    }
    if (rowError) { errors.push({ row: lineNo, key: id || undefined, message: rowError }); continue }

    // 個人事業主は法人種別を持たない
    if (data.entityType === 'sole_proprietor') data.corporatePrefix = null

    try {
      if (id) {
        if (!existingIds.has(id)) {
          errors.push({ row: lineNo, key: id, message: `運営者ID「${id}」が見つかりません（新規作成する場合はID欄を空にしてください）` })
          continue
        }
        if (('name' in data) && !String(data.name ?? '').trim()) {
          errors.push({ row: lineNo, key: id, message: '法人名が空です' })
          continue
        }
        if (('representativeName' in data) && !String(data.representativeName ?? '').trim()) {
          errors.push({ row: lineNo, key: id, message: '代表者氏名が空です' })
          continue
        }
        await prisma.operator.update({ where: { id }, data })
        touchedOperatorIds.push(id)
        updatedCount++
      } else {
        // 新規作成: 必須項目チェック
        if (!data.entityType) { errors.push({ row: lineNo, message: '会社形態が空です（新規作成に必須）' }); continue }
        if (!String(data.name ?? '').trim()) { errors.push({ row: lineNo, message: '法人名が空です（新規作成に必須）' }); continue }
        if (!String(data.representativeName ?? '').trim()) { errors.push({ row: lineNo, message: '代表者氏名が空です（新規作成に必須）' }); continue }
        if (data.supportedServices === undefined) data.supportedServices = '[]'
        if (data.invoiceRegistered === undefined) data.invoiceRegistered = false
        const created = await prisma.operator.create({ data: data as any })
        keyWrites.push({ rowNumber: lineNo, value: created.id })
        createdCount++
      }
    } catch (e) {
      errors.push({ row: lineNo, key: id || undefined, message: `保存に失敗: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // 継承項目（銀行口座/古物許可番号/インボイス番号）を紐づく店舗へ反映
  for (const opId of touchedOperatorIds) {
    try { await syncStoresForOperator(prisma, opId) } catch (e) {
      console.error(`[sheet-sync] 店舗への継承同期に失敗 (${opId}):`, e)
    }
  }

  // 新規作成分の運営者IDをシートへ書き戻す
  await writeBackKeys(sheets, target.spreadsheetId, target.sheetName, keyIdx, keyWrites)

  return {
    success: true,
    message: `更新${updatedCount}件・新規${createdCount}件を取り込みました${errors.length ? `（エラー${errors.length}件）` : ''}`,
    totalRows, createdCount, updatedCount, errorCount: errors.length, errors,
  }
}

// =============================================================
// 顧客情報
// =============================================================

async function getCustomerSheetTarget(): Promise<{ spreadsheetId: string; sheetName: string } | null> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.customerSpreadsheetId) return null
  return {
    spreadsheetId: extractSpreadsheetId(config.customerSpreadsheetId),
    sheetName: config.customerSheetName || '顧客情報',
  }
}

const CUSTOMER_SELECT = {
  id: true, name: true, furigana: true,
  lastName: true, firstName: true, lastNameKana: true, firstNameKana: true,
  email: true, phone: true, phone2: true, phone3: true, address: true,
  customerType: true, customerTypes: true, visitFrequencyMonths: true,
  occupation: true, leadSource: true, internalNote: true, birthDate: true,
  bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
  isActive: true, createdAt: true,
  store: { select: { code: true, name: true } },
} as const

/** 顧客レコードをシート行データに変換する（ids 指定時はその顧客のみ） */
async function buildCustomerRecords(ids?: string[]): Promise<RecordRow[]> {
  const customers = await prisma.user.findMany({
    // 統合で吸収された顧客（論理削除）はシートに出さない
    where: { mergedIntoUserId: null, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: CUSTOMER_SELECT,
  })
  const day = (d: Date) => new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })

  return customers.map(c => {
    const values: Record<string, string> = {}
    for (const col of CUSTOMER_SHEET_COLUMNS) {
      switch (col.key) {
        case 'customerTypes':
          values[col.key] = customerTypesLabel(c.customerTypes, c.customerType); break
        case 'visitFrequencyMonths':
          values[col.key] = String(c.visitFrequencyMonths ?? ''); break
        case 'isActive':   values[col.key] = c.isActive ? '有効' : '無効'; break
        case 'storeCode':  values[col.key] = c.store?.code ?? ''; break
        case 'storeName':  values[col.key] = c.store?.name ?? ''; break
        case 'createdAt':  values[col.key] = day(c.createdAt); break
        default: {
          const v = (c as Record<string, unknown>)[col.key]
          values[col.key] = v != null ? String(v) : ''
        }
      }
    }
    return { key: c.id, values }
  })
}

/** 全顧客を設定済みスプレッドシートへ出力する */
export async function exportCustomersToSheet(): Promise<ExportResult> {
  const target = await getCustomerSheetTarget()
  if (!target) return { success: false, message: '顧客情報用スプレッドシートIDが設定されていません', exported: 0 }

  const records = await buildCustomerRecords()

  try {
    return await exportRecordsToSheet({
      ...target,
      columns: CUSTOMER_SHEET_COLUMNS,
      keyColumnKey: 'id',
      records,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sheet-sync] exportCustomersToSheet 失敗:', message)
    return { success: false, message, exported: 0 }
  }
}

/** 設定済みスプレッドシートから顧客情報を取り込む（顧客IDで突合・空欄は新規作成） */
export async function importCustomersFromSheet(): Promise<ImportResult> {
  const fail = (message: string): ImportResult =>
    ({ success: false, message, totalRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0, errors: [] })

  const target = await getCustomerSheetTarget()
  if (!target) return fail('顧客情報用スプレッドシートIDが設定されていません')

  const keyCol = CUSTOMER_SHEET_COLUMNS.find(c => c.kind === 'key')!

  let sheetData: Awaited<ReturnType<typeof readSheetForImport>>
  try {
    sheetData = await readSheetForImport({ ...target, keyHeader: keyCol.header })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  if (!sheetData.ok) return fail(sheetData.message)
  const { sheets, rows, headerIdx, keyIdx } = sheetData

  const get = (row: string[], header: string) => {
    const idx = headerIdx[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }
  const headerOf = (key: string) => CUSTOMER_SHEET_COLUMNS.find(c => c.key === key)!.header
  /** 空欄は undefined。name-utils は undefined と空文字を区別するため必須の変換 */
  const orUndef = (s: string) => (s.trim() ? s.trim() : undefined)

  // 既存顧客をIDで一括取得
  const ids = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const v = get(rows[r], keyCol.header)
    if (v) ids.add(v)
  }
  const existing = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, customerType: true },
  })
  const byId = new Map(existing.map(u => [u.id, u]))

  // 担当店舗コード → 店舗ID（シートに出てくるコードだけ引く）
  const storeCodeHeader = headerOf('storeCode')
  const storeCodes = new Set<string>()
  if (storeCodeHeader in headerIdx) {
    for (let r = 1; r < rows.length; r++) {
      const c = get(rows[r], storeCodeHeader)
      if (c) storeCodes.add(c)
    }
  }
  const storeIdByCode = new Map<string, string>()
  if (storeCodes.size > 0) {
    const stores = await prisma.store.findMany({
      where: { code: { in: [...storeCodes] } },
      select: { id: true, code: true },
    })
    for (const s of stores) storeIdByCode.set(s.code, s.id)
  }

  const errors: RowError[] = []
  const keyWrites: { rowNumber: number; value: string }[] = []
  let createdCount = 0
  let updatedCount = 0
  let totalRows = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (isEmptyRow(row)) continue
    totalRows++
    const lineNo = r + 1
    const id = get(row, keyCol.header)
    const isNew = !id

    const data: Record<string, unknown> = {}
    let rowError: string | null = null

    // 氏名6フィールドは name-utils 経由でまとめて構築（結合値が正）
    const nameData = buildUserNameUpdateData({
      name:          orUndef(get(row, headerOf('name'))),
      furigana:      orUndef(get(row, headerOf('furigana'))),
      lastName:      orUndef(get(row, headerOf('lastName'))),
      firstName:     orUndef(get(row, headerOf('firstName'))),
      lastNameKana:  orUndef(get(row, headerOf('lastNameKana'))),
      firstNameKana: orUndef(get(row, headerOf('firstNameKana'))),
    })
    Object.assign(data, nameData)

    for (const col of CUSTOMER_SHEET_COLUMNS) {
      if (col.kind === 'key' || col.kind === 'ref' || col.kind === 'name') continue
      // シートに存在しない列は変更しない
      if (!(col.header in headerIdx)) continue
      const raw = get(row, col.header)

      if (col.kind === 'email') {
        if (raw && !EMAIL_RE.test(raw)) { rowError = `メール形式が不正「${raw}」`; break }
        data.email = raw || null
      } else if (col.kind === 'required') {
        const v = col.key === 'phone' ? normalizePhoneCell(raw) : raw
        // 空欄は「変更しない」扱い（NOT NULL 列を空文字で潰さないため）
        if (v) data[col.key] = v
      } else if (col.kind === 'types') {
        const types = customerTypesFromCell(raw)
        if (types.length > 0) {
          const primary = types[0]
          data.customerType = primary
          data.customerTypes = stringifyCustomerTypes(types, primary)
        }
      } else if (col.kind === 'int') {
        if (!raw) continue
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 1) { rowError = `${col.header}は1以上の数値で指定してください「${raw}」`; break }
        data.visitFrequencyMonths = Math.floor(n)
      } else if (col.kind === 'active') {
        const v = activeFromCell(raw)
        if (v !== undefined) data.isActive = v
      } else if (col.kind === 'store') {
        if (!raw) { data.storeId = null; continue }
        const storeId = storeIdByCode.get(raw)
        if (!storeId) { rowError = `担当店舗コード「${raw}」の店舗が見つかりません`; break }
        data.storeId = storeId
      } else if (col.key === 'phone2' || col.key === 'phone3') {
        data[col.key] = normalizePhoneCell(raw) || null
      } else {
        data[col.key] = raw || null
      }
    }
    if (rowError) { errors.push({ row: lineNo, key: id || undefined, message: rowError }); continue }

    try {
      if (!isNew) {
        if (!byId.has(id)) {
          errors.push({ row: lineNo, key: id, message: `顧客ID「${id}」が見つかりません（新規作成する場合はID欄を空にしてください）` })
          continue
        }
        await prisma.user.update({ where: { id }, data })
        updatedCount++
      } else {
        // 新規作成: NOT NULL 項目が揃っているか検証（氏名・ふりがな・電話・住所）
        const missing: string[] = []
        if (!data.name) missing.push('氏名')
        if (!data.furigana) missing.push('ふりがな')
        if (!data.phone) missing.push('電話番号')
        if (!data.address) missing.push('住所')
        if (missing.length > 0) {
          errors.push({ row: lineNo, message: `新規作成には ${missing.join('・')} が必要です` })
          continue
        }
        const created = await prisma.user.create({
          data: {
            ...data,
            // シート経由の新規顧客はログイン想定が無いためランダムパスワードを設定
            password: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          } as any,
        })
        keyWrites.push({ rowNumber: lineNo, value: created.id })
        createdCount++
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      // メールの一意制約は原因が分かる文言に置き換える
      const message = /Unique constraint.*email|`email`/i.test(raw)
        ? `このメールアドレスは既に別の顧客に登録されています`
        : `保存に失敗: ${raw}`
      errors.push({ row: lineNo, key: id || undefined, message })
    }
  }

  // 新規作成分の顧客IDをシートへ書き戻す
  await writeBackKeys(sheets, target.spreadsheetId, target.sheetName, keyIdx, keyWrites)

  return {
    success: true,
    message: `更新${updatedCount}件・新規${createdCount}件を取り込みました${errors.length ? `（エラー${errors.length}件）` : ''}`,
    totalRows, createdCount, updatedCount, errorCount: errors.length, errors,
  }
}

// =============================================================
// 自動同期（システム側の更新 → シートへ即時反映）
//
// 全件出力と違い、変更されたレコードの行だけを書き換える。
// シート側で編集中／未取込の他行を巻き込まないための行単位方式。
// 呼び出し側は after() 経由のベストエフォート実行を想定し、例外は投げない。
// =============================================================

/** 既存シートのレイアウト（ヘッダーと行番号索引） */
type SheetLayout = {
  /** キー列を含むヘッダー行が存在するか。false ならシートは未初期化 */
  hasHeader: boolean
  headerNorm: string[]
  /** 突合キー → シート上の行番号（1始まり） */
  rowNumberByKey: Map<string, number>
  /** 突合キー → 既存の行データ（独自列の持ち越し用） */
  existingRowByKey: Map<string, string[]>
  /** データ行の最終行番号（データが無ければヘッダー行番号） */
  lastRowNumber: number
}

/** シートの生データからレイアウトを読み取る（export はロジック単体検証のため） */
export function readLayout(values: string[][], keyHeader: string): SheetLayout {
  const headerNorm = (values[0] ?? []).map(normHeader)
  const keyIdx = headerNorm.indexOf(keyHeader)
  const rowNumberByKey = new Map<string, number>()
  const existingRowByKey = new Map<string, string[]>()
  let lastRowNumber = 1
  if (keyIdx >= 0) {
    for (let r = 1; r < values.length; r++) {
      if (!isEmptyRow(values[r])) lastRowNumber = r + 1
      const k = (values[r][keyIdx] ?? '').trim()
      if (!k || rowNumberByKey.has(k)) continue
      rowNumberByKey.set(k, r + 1)
      existingRowByKey.set(k, values[r])
    }
  }
  return { hasHeader: keyIdx >= 0, headerNorm, rowNumberByKey, existingRowByKey, lastRowNumber }
}

/**
 * レコードを既存シートのヘッダー列順に並べる。
 * 行単位同期では列の増減をしないため、シートに無いシステム列は書き込まず、
 * システム定義に無い独自列は既存値をそのまま残す。
 */
export function alignRowToHeader(
  layout: SheetLayout,
  columns: SheetSyncColumn[],
  rec: RecordRow,
): string[] {
  const keyByHeader = new Map(columns.map(c => [c.header, c.key]))
  const oldRow = layout.existingRowByKey.get(rec.key)
  return layout.headerNorm.map((h, i) => {
    const colKey = keyByHeader.get(h)
    if (colKey) return rec.values[colKey] ?? ''
    return oldRow?.[i] ?? ''
  })
}

/**
 * 指定レコードの行だけを更新する（シートに無いキーは末尾に追加）。
 * シートが未初期化（ヘッダー無し）の場合は needsFullExport を返す。
 */
async function syncRecordRowsToSheet(params: {
  spreadsheetId: string
  sheetName: string
  columns: SheetSyncColumn[]
  keyColumnKey: string
  records: RecordRow[]
}): Promise<{ needsFullExport: boolean; updated: number; appended: number }> {
  const { spreadsheetId, sheetName, columns, keyColumnKey, records } = params
  if (records.length === 0) return { needsFullExport: false, updated: 0, appended: 0 }

  const keyHeader = columns.find(c => c.key === keyColumnKey)!.header
  const sheets = getSheetsClient()
  const sheetId = await resolveSheetTab(sheets, spreadsheetId, sheetName, false)
  if (sheetId == null) return { needsFullExport: true, updated: 0, appended: 0 }

  const values = await readAllValues(sheets, spreadsheetId, sheetName)
  const layout = readLayout(values, keyHeader)
  if (!layout.hasHeader) return { needsFullExport: true, updated: 0, appended: 0 }

  const lastCol = idxToCol(layout.headerNorm.length - 1)
  const updates: sheets_v4.Schema$ValueRange[] = []
  const appends: string[][] = []

  for (const rec of records) {
    const row = alignRowToHeader(layout, columns, rec)
    const rowNumber = layout.rowNumberByKey.get(rec.key)
    if (rowNumber) {
      updates.push({ range: `${quoteSheetName(sheetName)}!A${rowNumber}:${lastCol}${rowNumber}`, values: [row] })
    } else {
      appends.push(row)
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    })
  }
  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    })
  }

  return { needsFullExport: false, updated: updates.length, appended: appends.length }
}

/** 指定キーの行をシートから削除する（見つからないキーは無視） */
async function deleteRecordRowsFromSheet(params: {
  spreadsheetId: string
  sheetName: string
  columns: SheetSyncColumn[]
  keyColumnKey: string
  keys: string[]
}): Promise<number> {
  const { spreadsheetId, sheetName, columns, keyColumnKey, keys } = params
  if (keys.length === 0) return 0

  const keyHeader = columns.find(c => c.key === keyColumnKey)!.header
  const sheets = getSheetsClient()
  const sheetId = await resolveSheetTab(sheets, spreadsheetId, sheetName, false)
  if (sheetId == null) return 0

  const values = await readAllValues(sheets, spreadsheetId, sheetName)
  const layout = readLayout(values, keyHeader)
  if (!layout.hasHeader) return 0

  // 行番号の大きい順に削除しないと、削除で行がずれて別の行を消してしまう
  const rowNumbers = keys
    .map(k => layout.rowNumberByKey.get(k))
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => b - a)
  if (rowNumbers.length === 0) return 0

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: rowNumbers.map(n => ({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: n - 1, endIndex: n },
        },
      })),
    },
  })
  return rowNumbers.length
}

async function logAutoSyncFailure(type: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[sheet-sync] 自動同期に失敗 (${type}):`, message)
  try {
    await prisma.syncLog.create({ data: { type, status: 'error', message: message.slice(0, 1000) } })
  } catch { /* ログ保存の失敗で呼び出し元に影響を出さない */ }
}

/** 自動同期が有効か（スプレッドシート未設定・サービスアカウント未設定なら何もしない） */
function autoSyncEnabled(target: { spreadsheetId: string } | null): target is { spreadsheetId: string; sheetName: string } {
  return !!target && !!process.env.GOOGLE_SHEETS_CLIENT_EMAIL
}

/**
 * 指定店舗の行をシートへ反映する（ベストエフォート・例外を投げない）。
 * 店舗コードの配列を渡す。設定が無ければ何もしない。
 */
export async function autoSyncStoreRows(codes: string[]): Promise<void> {
  const unique = [...new Set(codes.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getStoreSheetTarget()
    if (!autoSyncEnabled(target)) return
    const records = await buildStoreRecords(unique)
    if (records.length === 0) return
    const res = await syncRecordRowsToSheet({
      ...target, columns: STORE_CSV_COLUMNS, keyColumnKey: 'code', records,
    })
    // シート未初期化なら全件出力でヘッダーごと作る
    if (res.needsFullExport) await exportStoresToSheet()
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:stores', error)
  }
}

/** 削除された店舗の行をシートから取り除く（ベストエフォート） */
export async function autoSyncStoreRowsDeleted(codes: string[]): Promise<void> {
  const unique = [...new Set(codes.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getStoreSheetTarget()
    if (!autoSyncEnabled(target)) return
    await deleteRecordRowsFromSheet({
      ...target, columns: STORE_CSV_COLUMNS, keyColumnKey: 'code', keys: unique,
    })
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:stores', error)
  }
}

/** 指定運営者の行をシートへ反映する（ベストエフォート・例外を投げない） */
export async function autoSyncOperatorRows(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getOperatorSheetTarget()
    if (!autoSyncEnabled(target)) return
    const records = await buildOperatorRecords(unique)
    if (records.length === 0) return
    const res = await syncRecordRowsToSheet({
      ...target, columns: OPERATOR_SHEET_COLUMNS, keyColumnKey: 'id', records,
    })
    if (res.needsFullExport) await exportOperatorsToSheet()
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:operators', error)
  }
}

/** 削除された運営者の行をシートから取り除く（ベストエフォート） */
export async function autoSyncOperatorRowsDeleted(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getOperatorSheetTarget()
    if (!autoSyncEnabled(target)) return
    await deleteRecordRowsFromSheet({
      ...target, columns: OPERATOR_SHEET_COLUMNS, keyColumnKey: 'id', keys: unique,
    })
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:operators', error)
  }
}

/** 指定顧客の行をシートへ反映する（ベストエフォート・例外を投げない） */
export async function autoSyncCustomerRows(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getCustomerSheetTarget()
    if (!autoSyncEnabled(target)) return
    const records = await buildCustomerRecords(unique)
    if (records.length === 0) return
    const res = await syncRecordRowsToSheet({
      ...target, columns: CUSTOMER_SHEET_COLUMNS, keyColumnKey: 'id', records,
    })
    if (res.needsFullExport) await exportCustomersToSheet()
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:customers', error)
  }
}

/** 削除・統合された顧客の行をシートから取り除く（ベストエフォート） */
export async function autoSyncCustomerRowsDeleted(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const target = await getCustomerSheetTarget()
    if (!autoSyncEnabled(target)) return
    await deleteRecordRowsFromSheet({
      ...target, columns: CUSTOMER_SHEET_COLUMNS, keyColumnKey: 'id', keys: unique,
    })
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:customers', error)
  }
}

/**
 * 運営者の変更に伴い、紐づく店舗の行（運営者名・継承項目）もまとめて反映する。
 * 店舗IDから店舗コードを引いてから行単位で更新する。
 */
export async function autoSyncStoreRowsByIds(storeIds: string[]): Promise<void> {
  const unique = [...new Set(storeIds.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const stores = await prisma.store.findMany({
      where: { id: { in: unique } },
      select: { code: true },
    })
    await autoSyncStoreRows(stores.map(s => s.code))
  } catch (error) {
    await logAutoSyncFailure('sheet-auto-sync:stores', error)
  }
}
