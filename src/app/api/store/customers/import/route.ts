import { NextRequest, NextResponse, after } from 'next/server'
import { autoSyncCustomerRows } from '@/lib/sheet-sync'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { stringifyCustomerTypes, type CustomerType } from '@/lib/customer-types'
import { buildUserNameData } from '@/lib/name-utils'

// テンプレートの列。取込時は旧形式のヘッダー（氏名/フリガナ/メール/電話…）も別名として受理する
const COLUMNS: { header: string; required?: boolean }[] = [
  { header: '姓',           required: true },
  { header: '名',           required: true },
  { header: '姓フリガナ' },
  { header: '名フリガナ' },
  { header: 'メールアドレス' },
  { header: '電話番号1',    required: true },
  { header: '電話番号2' },
  { header: '電話番号3' },
  { header: '住所' },
  { header: '最終訪問日' },
]

/** ヘッダーの別名（左が正式名。旧テンプレートのCSVをそのまま取り込めるようにする） */
const HEADER_ALIASES: Record<string, string[]> = {
  'メールアドレス': ['メール', 'Email', 'email'],
  '電話番号1':      ['電話番号', '電話', 'TEL', 'tel'],
  '電話番号2':      ['電話2'],
  '電話番号3':      ['電話3'],
  '最終訪問日':     ['最終訪問', '前回訪問日'],
}

/** インポートした顧客の顧客タイプは常に「通常買取」にする */
const IMPORT_CUSTOMER_TYPE: CustomerType = 'regular'

/** "YYYY/MM/DD"（"YYYY-MM-DD" / "YYYY.MM.DD" も可）→ JSTのその日0時。不正値は undefined */
function parseVisitDate(value: string): Date | null | undefined {
  const v = value.trim()
  if (!v) return null // 空欄は「指定なし」
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(v)
  if (!m) return undefined
  const [, y, mo, d] = m
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000+09:00`
  const date = new Date(iso)
  if (isNaN(date.getTime())) return undefined
  // 2026-02-31 のような存在しない日付を弾く
  if (date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) !== `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`) return undefined
  return date
}

type RowError = { row: number; name?: string; message: string }

async function requireStore() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser?.role !== 'store') return null
  return sessionUser
}

/** GET: CSV テンプレートをダウンロード */
export async function GET() {
  const store = await requireStore()
  if (!store) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = COLUMNS.map(c => c.required ? `${c.header}*` : c.header)
  const sample = [
    '山田', '太郎', 'ヤマダ', 'タロウ', 'yamada@example.com',
    '090-1234-5678', '03-1234-5678', '',
    '東京都渋谷区...',
    '2026/08/01',
  ]
  const csv = buildCsv([headers, sample])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="store-customers-template.csv"',
    },
  })
}

/** POST: CSV をパースして自店舗の顧客を作成 */
export async function POST(req: NextRequest) {
  const store = await requireStore()
  if (!store) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // ヘッダー解析（末尾の "*" を取り除く）
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const idxOf: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) idxOf[headerRow[i]] = i
  // 別名ヘッダーを正式名に寄せる（旧テンプレートのCSVをそのまま取り込めるように）
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (canonical in idxOf) continue
    const hit = aliases.find(a => a in idxOf)
    if (hit !== undefined) idxOf[canonical] = idxOf[hit]
  }

  // 氏名列: 新形式「姓」「名」または旧形式「氏名」のどちらかが必要（後方互換）
  const hasSplitCols = '姓' in idxOf && '名' in idxOf
  const hasLegacyName = '氏名' in idxOf
  const missing: string[] = []
  if (!hasSplitCols && !hasLegacyName) missing.push('姓・名（または旧形式の「氏名」）')
  if (!('電話番号1' in idxOf)) missing.push('電話番号1')
  if (missing.length > 0) {
    return NextResponse.json({ error: `必須列が見つかりません: ${missing.join(', ')}` }, { status: 400 })
  }

  const get = (row: string[], header: string) => {
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  const errors: RowError[] = []
  // シートへ反映する対象（新規・更新の両方）
  const syncedUserIds: string[] = []
  let createdCount = 0
  let updatedCount = 0
  const totalRows = rows.length - 1

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const lineNo = r + 1
    // 新形式（姓/名）優先、旧形式（氏名/フリガナ）はスペース分割で取込
    const nameData = buildUserNameData({
      name:          get(row, '氏名'),
      furigana:      get(row, 'フリガナ'),
      lastName:      hasSplitCols ? get(row, '姓') : '',
      firstName:     hasSplitCols ? get(row, '名') : '',
      lastNameKana:  get(row, '姓フリガナ'),
      firstNameKana: get(row, '名フリガナ'),
    })
    const name      = nameData.name
    const furigana  = nameData.furigana
    const emailRaw  = get(row, 'メールアドレス')
    const phone     = get(row, '電話番号1').replace(/[-ー\s]/g, '')
    const phone2Raw = get(row, '電話番号2').replace(/[-ー\s]/g, '')
    const phone3Raw = get(row, '電話番号3').replace(/[-ー\s]/g, '')
    const address   = get(row, '住所')
    const lastVisitRaw = get(row, '最終訪問日')
    const note      = get(row, '内部メモ') // 旧テンプレートに列があれば取り込む

    if (!name)  { errors.push({ row: lineNo, message: '氏名が空です' }); continue }
    if (!phone) { errors.push({ row: lineNo, name, message: '電話番号が空です' }); continue }

    const email = emailRaw || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: lineNo, name, message: `メール形式が不正: "${email}"` })
      continue
    }

    const lastVisitedAt = parseVisitDate(lastVisitRaw)
    if (lastVisitedAt === undefined) {
      errors.push({ row: lineNo, name, message: `最終訪問日の形式が不正: "${lastVisitRaw}"（YYYY/MM/DD で入力）` })
      continue
    }

    // インポートした顧客は常に「通常買取」
    const customerType: CustomerType = IMPORT_CUSTOMER_TYPE
    const customerTypesJson = stringifyCustomerTypes([customerType], customerType)

    try {
      // メールが指定されていて自店舗内に既存ユーザがあれば更新、無ければ作成
      let existingId: string | null = null
      if (email) {
        const existing = await prisma.user.findFirst({
          where: { email, storeId: store.id },
          select: { id: true },
        })
        if (existing) existingId = existing.id
      }

      if (existingId) {
        const data: Record<string, unknown> = { name, lastName: nameData.lastName, firstName: nameData.firstName, phone }
        if (furigana) {
          data.furigana = furigana
          data.lastNameKana = nameData.lastNameKana
          data.firstNameKana = nameData.firstNameKana
        }
        if (address)  data.address  = address
        if (phone2Raw) data.phone2 = phone2Raw
        if (phone3Raw) data.phone3 = phone3Raw
        if (note)      data.internalNote = note
        if (lastVisitedAt) data.lastVisitedAt = lastVisitedAt
        data.customerType = customerType
        data.customerTypes = customerTypesJson
        await prisma.user.update({ where: { id: existingId }, data })
        syncedUserIds.push(existingId)
        updatedCount++
      } else {
        // 新規作成（仮パスワードを自動生成）
        const tempPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
        const createdUser = await prisma.user.create({
          data: {
            ...nameData,
            furigana: furigana || '',
            phone,
            phone2: phone2Raw || null,
            phone3: phone3Raw || null,
            address: address || '',
            email,
            password: tempPassword,
            storeId: store.id,
            customerType,
            customerTypes: customerTypesJson,
            lastVisitedAt: lastVisitedAt ?? null,
            internalNote: note || null,
          },
        })
        syncedUserIds.push(createdUser.id)
        createdCount++
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ row: lineNo, name, message: `保存に失敗: ${message}` })
    }
  }

  after(() => autoSyncCustomerRows(syncedUserIds))

  return NextResponse.json({ totalRows, createdCount, updatedCount, errorCount: errors.length, errors })
}
