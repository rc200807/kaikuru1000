import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { CORPORATE_PREFIXES, ENTITY_TYPES, PREFIX_POSITIONS } from '@/lib/operator-utils'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

/**
 * CSV ヘッダー（日本語ラベル）→ Operator フィールド名 のマッピング
 * 順序がそのままサンプルCSVの列順となる
 */
const COLUMN_MAP: { header: string; field: string; required?: boolean }[] = [
  { header: '会社形態',                         field: 'entityType', required: true },
  { header: '法人種別',                         field: 'corporatePrefix' },
  { header: '形態位置',                         field: 'prefixPosition' },
  { header: '会社名',                           field: 'name', required: true },
  { header: '所在地',                           field: 'address' },
  { header: '代表者氏名',                       field: 'representativeName', required: true },
  { header: '代表者氏名（フリガナ）',           field: 'representativeNameKana' },
  { header: '法人番号',                         field: 'corporateNumber' },
  { header: 'インボイス登録',                   field: 'invoiceRegistered' },
  { header: '適格請求書発行事業者登録番号',      field: 'invoiceNumber' },
  { header: '電話番号',                         field: 'phone' },
  { header: 'メールアドレス',                   field: 'email' },
  { header: '古物営業許可番号',                 field: 'antiquePermitNumber' },
  { header: '古物営業所住所',                   field: 'antiqueOfficeAddress' },
  { header: '古物営業法届出名義',               field: 'antiqueLicenseHolder' },
  { header: '管轄公安委員会',                   field: 'publicSafetyCommission' },
  { header: '運営サービス',                     field: 'service' },
]

const ENTITY_TYPE_FROM_LABEL: Record<string, string> = {
  '法人':       'corporation',
  'corporation': 'corporation',
  '個人事業主':  'sole_proprietor',
  'sole_proprietor': 'sole_proprietor',
}
const PREFIX_POSITION_FROM_LABEL: Record<string, string> = {
  '前':     'before',
  '前置':    'before',
  'before':  'before',
  '後':     'after',
  '後置':    'after',
  'after':   'after',
}

function parseBool(v: string): boolean {
  const t = v.trim().toLowerCase()
  return ['true', '1', 'はい', '○', '◯', 'yes', 'y', '登録済', '登録'].includes(t)
}

/** GET: サンプルCSVをダウンロード */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = COLUMN_MAP.map(c => c.required ? `${c.header}*` : c.header)
  const sample = [
    '法人', '株式会社', '前', '買いクル', '東京都渋谷区...',
    '山田 太郎', 'ヤマダ タロウ', '1234567890123', 'はい', 'T1234567890123',
    '03-1234-5678', 'info@example.com', '第123456789号', '東京都新宿区...',
    '山田 太郎', '東京都公安委員会', '出張買取・宅配買取',
  ]
  const csv = buildCsv([headers, sample])
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="operators-import-template.csv"',
    },
  })
}

/** POST: CSV をパースして一括登録 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let csvText: string
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
    csvText = await file.text()
  } else {
    const body = await req.json().catch(() => ({}))
    csvText = typeof body.csv === 'string' ? body.csv : ''
    if (!csvText) return NextResponse.json({ error: 'CSV データが空です' }, { status: 400 })
  }

  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'ヘッダー行とデータ行が必要です' }, { status: 400 })
  }

  // ヘッダー行のマッピング（末尾の * は除去して比較）
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const headerToIndex: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) {
    headerToIndex[headerRow[i]] = i
  }

  // 必須ヘッダーチェック
  const missingRequired = COLUMN_MAP
    .filter(c => c.required && !(c.header in headerToIndex))
    .map(c => c.header)
  if (missingRequired.length > 0) {
    return NextResponse.json({
      error: `必須列が見つかりません: ${missingRequired.join(', ')}`,
    }, { status: 400 })
  }

  const errors: { row: number; message: string }[] = []
  const records: Record<string, unknown>[] = []

  // 行 i は 2始まり（1=ヘッダー）
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const get = (header: string) => {
      const idx = headerToIndex[header]
      return idx === undefined ? '' : (row[idx] ?? '').trim()
    }

    const rec: Record<string, unknown> = {}
    let invalid = false

    // entityType
    const entityRaw = get('会社形態')
    const entityType = ENTITY_TYPE_FROM_LABEL[entityRaw]
    if (!entityType || !ENTITY_TYPES.includes(entityType as any)) {
      errors.push({ row: r + 1, message: `会社形態が不正: "${entityRaw}"（"法人" or "個人事業主"）` })
      invalid = true
    } else {
      rec.entityType = entityType
    }

    // corporatePrefix（法人時のみ）
    const prefixRaw = get('法人種別')
    if (entityType === 'corporation' && prefixRaw) {
      if (!(CORPORATE_PREFIXES as readonly string[]).includes(prefixRaw)) {
        errors.push({ row: r + 1, message: `法人種別が候補に含まれません: "${prefixRaw}"` })
        invalid = true
      } else {
        rec.corporatePrefix = prefixRaw
      }
    } else {
      rec.corporatePrefix = null
    }

    // prefixPosition
    const posRaw = get('形態位置')
    if (entityType === 'corporation' && posRaw) {
      const pos = PREFIX_POSITION_FROM_LABEL[posRaw]
      if (!pos || !PREFIX_POSITIONS.includes(pos as any)) {
        errors.push({ row: r + 1, message: `形態位置が不正: "${posRaw}"（"前" or "後"）` })
        invalid = true
      } else {
        rec.prefixPosition = pos
      }
    } else {
      rec.prefixPosition = null
    }

    // 文字列必須
    const name = get('会社名')
    if (!name) {
      errors.push({ row: r + 1, message: '会社名が空です' })
      invalid = true
    } else {
      rec.name = name
    }
    const repName = get('代表者氏名')
    if (!repName) {
      errors.push({ row: r + 1, message: '代表者氏名が空です' })
      invalid = true
    } else {
      rec.representativeName = repName
    }

    // optional 文字列
    const optionalStringFields: { header: string; field: string }[] = [
      { header: '所在地',                       field: 'address' },
      { header: '代表者氏名（フリガナ）',         field: 'representativeNameKana' },
      { header: '法人番号',                     field: 'corporateNumber' },
      { header: '適格請求書発行事業者登録番号',  field: 'invoiceNumber' },
      { header: '電話番号',                     field: 'phone' },
      { header: 'メールアドレス',               field: 'email' },
      { header: '古物営業許可番号',             field: 'antiquePermitNumber' },
      { header: '古物営業所住所',               field: 'antiqueOfficeAddress' },
      { header: '古物営業法届出名義',           field: 'antiqueLicenseHolder' },
      { header: '管轄公安委員会',               field: 'publicSafetyCommission' },
      { header: '運営サービス',                 field: 'service' },
    ]
    for (const { header, field } of optionalStringFields) {
      const v = get(header)
      rec[field] = v === '' ? null : v
    }

    // invoiceRegistered
    const invRaw = get('インボイス登録')
    rec.invoiceRegistered = invRaw === '' ? false : parseBool(invRaw)

    if (!invalid) records.push(rec)
  }

  if (errors.length > 0 && records.length === 0) {
    return NextResponse.json({ created: 0, errors }, { status: 400 })
  }

  // トランザクションで一括作成
  let created = 0
  try {
    const result = await prisma.$transaction(
      records.map(rec => prisma.operator.create({ data: rec as any }))
    )
    created = result.length
  } catch (err: any) {
    return NextResponse.json({
      error: 'DB保存に失敗しました',
      detail: err?.message ?? String(err),
      errors,
    }, { status: 500 })
  }

  return NextResponse.json({ created, errors })
}
