import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { CUSTOMER_TYPES, stringifyCustomerTypes, type CustomerType, isCustomerType } from '@/lib/customer-types'
import { buildUserNameData } from '@/lib/name-utils'

// 新形式テンプレート（姓・名分割）。旧形式「氏名/フリガナ」列のCSVも取込時に受理する（後方互換）
const COLUMNS: { header: string; required?: boolean }[] = [
  { header: '姓',           required: true },
  { header: '名',           required: true },
  { header: '姓フリガナ' },
  { header: '名フリガナ' },
  { header: 'メール' },
  { header: '電話',         required: true },
  { header: '電話2' },
  { header: '電話3' },
  { header: '住所' },
  { header: '顧客タイプ' },
  { header: '訪問頻度（月）' },
  { header: '内部メモ' },
]

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
    '訪問型',  // 'visit' | 'delivery' | 'regular' | 'akikuru' or 日本語
    '1',
    '高齢でゆっくり話す必要あり',
  ]
  const csv = buildCsv([headers, sample])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="store-customers-template.csv"',
    },
  })
}

/** 顧客タイプの日本語/英語両対応 */
function resolveCustomerType(input: string): CustomerType | null {
  const v = input.trim()
  if (!v) return null
  // 英語キーをそのまま
  if (isCustomerType(v)) return v
  // 日本語ラベル
  const map: Record<string, CustomerType> = {
    '訪問型':   'visit',
    '宅配型':   'delivery',
    '通常買取': 'regular',
    'アキクル': 'akikuru',
    // 旧表現も互換
    '定期訪問': 'visit',
    '定期宅配': 'delivery',
  }
  return map[v] ?? null
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

  // 氏名列: 新形式「姓」「名」または旧形式「氏名」のどちらかが必要（後方互換）
  const hasSplitCols = '姓' in idxOf && '名' in idxOf
  const hasLegacyName = '氏名' in idxOf
  const missing: string[] = []
  if (!hasSplitCols && !hasLegacyName) missing.push('姓・名（または旧形式の「氏名」）')
  if (!('電話' in idxOf)) missing.push('電話')
  if (missing.length > 0) {
    return NextResponse.json({ error: `必須列が見つかりません: ${missing.join(', ')}` }, { status: 400 })
  }

  const get = (row: string[], header: string) => {
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  const errors: RowError[] = []
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
    const emailRaw  = get(row, 'メール')
    const phone     = get(row, '電話').replace(/[-ー\s]/g, '')
    const phone2Raw = get(row, '電話2').replace(/[-ー\s]/g, '')
    const phone3Raw = get(row, '電話3').replace(/[-ー\s]/g, '')
    const address   = get(row, '住所')
    const typeRaw   = get(row, '顧客タイプ')
    const freqRaw   = get(row, '訪問頻度（月）')
    const note      = get(row, '内部メモ')

    if (!name)  { errors.push({ row: lineNo, message: '氏名が空です' }); continue }
    if (!phone) { errors.push({ row: lineNo, name, message: '電話番号が空です' }); continue }

    const email = emailRaw || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: lineNo, name, message: `メール形式が不正: "${email}"` })
      continue
    }

    const customerType: CustomerType = typeRaw ? (resolveCustomerType(typeRaw) ?? 'visit') : 'visit'
    const customerTypesJson = stringifyCustomerTypes([customerType], customerType)

    const visitFrequencyMonths = (() => {
      const n = parseInt(freqRaw, 10)
      return isNaN(n) || n < 1 ? 1 : n
    })()

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
        data.customerType = customerType
        data.customerTypes = customerTypesJson
        data.visitFrequencyMonths = visitFrequencyMonths
        await prisma.user.update({ where: { id: existingId }, data })
        updatedCount++
      } else {
        // 新規作成（仮パスワードを自動生成）
        const tempPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
        await prisma.user.create({
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
            visitFrequencyMonths,
            internalNote: note || null,
          },
        })
        createdCount++
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ row: lineNo, name, message: `保存に失敗: ${message}` })
    }
  }

  return NextResponse.json({ totalRows, createdCount, updatedCount, errorCount: errors.length, errors })
}
