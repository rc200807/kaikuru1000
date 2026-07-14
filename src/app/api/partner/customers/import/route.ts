import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { buildUserNameData } from '@/lib/name-utils'

// 新形式テンプレート（姓・名分割）。旧形式「氏名/フリガナ」列のCSVも取込時に受理する（後方互換）
const COLUMNS: { header: string; required?: boolean }[] = [
  { header: 'ライセンスキー', required: true },
  { header: '姓',             required: true },
  { header: '名',             required: true },
  { header: '姓フリガナ' },
  { header: '名フリガナ' },
  { header: 'メール' },
  { header: '電話' },
  { header: '住所' },
]

type RowError = { row: number; licenseKey?: string; message: string }

/** GET: CSV テンプレートをダウンロード */
export async function GET() {
  const partner = await requirePartner()
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = COLUMNS.map(c => c.required ? `${c.header}*` : c.header)
  const sample = ['LICENSE-XXXX', '山田', '太郎', 'ヤマダ', 'タロウ', 'yamada@example.com', '090-1234-5678', '東京都渋谷区...']
  const csv = buildCsv([headers, sample])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="partner-customers-template.csv"',
    },
  })
}

/** POST: CSV をパースしてライセンスキー紐づけ顧客を作成/更新 */
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

  // 氏名列: 新形式「姓」「名」または旧形式「氏名」のどちらかが必要（後方互換）
  const hasSplitCols = '姓' in idxOf && '名' in idxOf
  const hasLegacyName = '氏名' in idxOf
  const missing: string[] = []
  if (!('ライセンスキー' in idxOf)) missing.push('ライセンスキー')
  if (!hasSplitCols && !hasLegacyName) missing.push('姓・名（または旧形式の「氏名」）')
  if (missing.length > 0) {
    return NextResponse.json({ error: `必須列が見つかりません: ${missing.join(', ')}` }, { status: 400 })
  }

  const get = (row: string[], header: string) => {
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  // 1) ライセンスキーをまとめて取得（user 付き）
  const keys = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const k = get(rows[r], 'ライセンスキー')
    if (k) keys.add(k)
  }
  const licenseKeys = await prisma.licenseKey.findMany({
    where: { key: { in: [...keys] } },
    include: { user: { select: { id: true } } },
  })
  const keyMap = new Map(licenseKeys.map(lk => [lk.key, lk]))

  const errors: RowError[] = []
  let createdCount = 0
  let updatedCount = 0
  const totalRows = rows.length - 1

  // 2) 行ごとに処理（順次トランザクション外で OK：エラーは行単位で集計）
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const lineNo = r + 1
    const licenseKey = get(row, 'ライセンスキー')
    // 新形式（姓/名）優先、旧形式（氏名/フリガナ）はスペース分割で取込
    const nameData = buildUserNameData({
      name:          get(row, '氏名'),
      furigana:      get(row, 'フリガナ'),
      lastName:      hasSplitCols ? get(row, '姓') : '',
      firstName:     hasSplitCols ? get(row, '名') : '',
      lastNameKana:  get(row, '姓フリガナ'),
      firstNameKana: get(row, '名フリガナ'),
    })
    const name = nameData.name

    if (!licenseKey) { errors.push({ row: lineNo, message: 'ライセンスキーが空です' }); continue }
    if (!name)       { errors.push({ row: lineNo, licenseKey, message: '氏名（姓・名）が空です' }); continue }

    const lk = keyMap.get(licenseKey)
    if (!lk) {
      errors.push({ row: lineNo, licenseKey, message: `ライセンスキー "${licenseKey}" が登録されていません` })
      continue
    }

    const emailRaw = get(row, 'メール')
    const email = emailRaw || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: lineNo, licenseKey, message: `メール形式が不正: "${email}"` })
      continue
    }

    const furigana = nameData.furigana
    const phone    = get(row, '電話')
    const address  = get(row, '住所')

    try {
      if (lk.user) {
        // 更新（空欄カラムは上書きしない）
        const data: Record<string, unknown> = { name, lastName: nameData.lastName, firstName: nameData.firstName }
        if (furigana) {
          data.furigana = furigana
          data.lastNameKana = nameData.lastNameKana
          data.firstNameKana = nameData.firstNameKana
        }
        if (phone)    data.phone    = phone
        if (address)  data.address  = address
        if (emailRaw !== '') data.email = email
        await prisma.user.update({ where: { id: lk.user.id }, data })
        updatedCount++
      } else {
        // 新規作成：仮パスワードを自動生成
        const tempPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
        await prisma.$transaction([
          prisma.user.create({
            data: {
              ...nameData,
              furigana: furigana || '',
              phone:    phone    || '',
              address:  address  || '',
              email,
              password: tempPassword,
              licenseKeyId: lk.id,
            },
          }),
          prisma.licenseKey.update({ where: { id: lk.id }, data: { isUsed: true } }),
        ])
        createdCount++
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ row: lineNo, licenseKey, message: `保存に失敗: ${message}` })
    }
  }

  // 3) 履歴を保存
  await prisma.partnerCustomerImport.create({
    data: {
      partnerId:    partner.id,
      fileName:     file.name || 'upload.csv',
      totalRows,
      createdCount,
      updatedCount,
      errorCount:   errors.length,
      errors:       errors.length > 0 ? errors : undefined,
    },
  })

  return NextResponse.json({ totalRows, createdCount, updatedCount, errorCount: errors.length, errors })
}
