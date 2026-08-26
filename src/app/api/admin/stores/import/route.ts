import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { autoSyncStoreRows } from '@/lib/sheet-sync'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { parseCsv } from '@/lib/csv-parser'
import { STORE_CSV_COLUMNS, resolveStoreCsvHeader, storeStatusValueFromCell } from '@/lib/store-csv'
import { storeServicesValueFromCell } from '@/lib/store-services'
import { operatorInheritedValues } from '@/lib/operator-store-sync'
import { recordAccessLog } from '@/lib/access-log'

type RowError = { row: number; code?: string; message: string }

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(12)).map(b => chars[b % chars.length]).join('')
}
async function genUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString('hex')
    if (!(await prisma.store.findFirst({ where: { code }, select: { id: true } }))) return code
  }
  return randomBytes(6).toString('hex')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 店舗情報CSVを取り込む（店舗コードで突合し更新、コード空欄は新規作成）。 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const rows = parseCsv(await file.text())
  if (rows.length < 2) return NextResponse.json({ error: 'ヘッダー行とデータ行が必要です' }, { status: 400 })

  // ヘッダー → 列インデックス
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const idxOf: Record<string, number> = {}
  headerRow.forEach((h, i) => { if (!(h in idxOf)) idxOf[h] = i })

  const codeCol = STORE_CSV_COLUMNS.find(c => c.kind === 'key')!
  const nameCol = STORE_CSV_COLUMNS.find(c => c.key === 'name')!
  if (!(codeCol.header in idxOf)) {
    return NextResponse.json({ error: `必須列「${codeCol.header}」が見つかりません` }, { status: 400 })
  }
  if (!(nameCol.header in idxOf)) {
    return NextResponse.json({ error: `必須列「${nameCol.header}」が見つかりません` }, { status: 400 })
  }

  const get = (row: string[], header: string) => {
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  // 既存店舗をコードで一括取得（突合用）
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

  // 運営者の継承値（bank/invoice/permit）を id ごとにキャッシュ
  const opIds = [...new Set(existing.map(s => s.operatorId).filter((v): v is string => !!v))]
  const inheritedByOp = new Map<string, Record<string, string | null>>()
  if (opIds.length > 0) {
    const ops = await prisma.operator.findMany({
      where: { id: { in: opIds } },
      select: { id: true, bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true, antiquePermitNumber: true, invoiceNumber: true },
    })
    for (const op of ops) inheritedByOp.set(op.id, operatorInheritedValues(op))
  }

  const errors: RowError[] = []
  const syncedCodes: string[] = []
  let createdCount = 0
  let updatedCount = 0
  const totalRows = rows.length - 1

  // フィールド列（更新対象）: key/ref を除く
  const fieldCols = STORE_CSV_COLUMNS.filter(c => c.kind !== 'key' && c.kind !== 'ref')

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const lineNo = r + 1
    const code = get(row, codeCol.header)

    // CSVのセル → 保存データを構築
    const data: Record<string, unknown> = {}
    let rowError: string | null = null
    for (const col of fieldCols) {
      // CSVに存在しない列は変更しない（旧フォーマットのCSVで既存値を消さない）
      // 見出しを変更した列は旧見出し（aliases）でも受け付ける
      const header = resolveStoreCsvHeader(col, h => h in idxOf)
      if (!header) continue
      const raw = get(row, header)
      if (col.kind === 'status') {
        const v = storeStatusValueFromCell(raw)
        if (v === undefined) { rowError = `不明なステータス「${raw}」`; break }
        data.storeStatus = v
      } else if (col.kind === 'services') {
        // ラベル/キーの区切り文字列 → 正規化JSON配列（不明値は無視、空欄は '[]'）
        data.supportedServices = storeServicesValueFromCell(raw)
      } else if (col.kind === 'date') {
        if (!raw) { data[col.key] = null; continue }
        const d = new Date(raw)
        if (isNaN(d.getTime())) { rowError = `${header}の日付形式が不正「${raw}」`; break }
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
    if (rowError) { errors.push({ row: lineNo, code: code || undefined, message: rowError }); continue }

    const name = String(data.name ?? '').trim()
    if (!name) { errors.push({ row: lineNo, code: code || undefined, message: '店舗名が空です' }); continue }

    try {
      if (code) {
        const store = byCode.get(code)
        if (!store) {
          errors.push({ row: lineNo, code, message: `店舗コード「${code}」が見つかりません（新規作成する場合はコード欄を空にしてください）` })
          continue
        }
        // 運営者割り当て済みなら継承項目（銀行口座/古物許可/インボイス）は運営者を「正」として上書き
        const finalData = { ...data }
        if (store.operatorId && inheritedByOp.has(store.operatorId)) {
          Object.assign(finalData, inheritedByOp.get(store.operatorId))
        }
        await prisma.store.update({ where: { id: store.id }, data: finalData })
        syncedCodes.push(code)
        updatedCount++
      } else {
        const newCode = await genUniqueCode()
        const hashed = await bcrypt.hash(genPassword(), 10)
        await prisma.store.create({ data: { ...data, name, code: newCode, password: hashed } as any })
        syncedCodes.push(newCode)
        createdCount++
      }
    } catch (e) {
      errors.push({ row: lineNo, code: code || undefined, message: `保存に失敗: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `店舗情報CSVインポート（新規${createdCount}・更新${updatedCount}・エラー${errors.length}）`, req,
  })

  after(() => autoSyncStoreRows(syncedCodes))

  return NextResponse.json({ totalRows, createdCount, updatedCount, errorCount: errors.length, errors })
}
