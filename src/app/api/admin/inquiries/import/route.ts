import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCsv, buildCsv } from '@/lib/csv-parser'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

/**
 * 共通カラムマップ。`scope=store` の場合は 店舗コード を除外する。
 */
function buildColumnMap(includeStoreCode: boolean) {
  const map: { header: string; field: string; required?: boolean }[] = []
  if (includeStoreCode) {
    map.push({ header: '店舗コード', field: 'storeCode', required: true })
  }
  map.push(
    { header: '受付日時',    field: 'createdAt' },
    { header: '氏名',        field: 'name', required: true },
    { header: 'フリガナ',    field: 'furigana', required: true },
    { header: '電話',        field: 'phone', required: true },
    { header: 'メール',      field: 'email' },
    { header: '郵便番号',    field: 'postalCode' },
    { header: '住所',        field: 'address' },
    { header: '申込内容',    field: 'inquiryType', required: true },
    { header: '相談内容',    field: 'details' },
    { header: 'ステータス',  field: 'status' },
  )
  return map
}

const STATUS_FROM_LABEL: Record<string, string> = {
  '新規':       'new',
  '対応中':     'contacted',
  '完了':       'completed',
  'new':        'new',
  'contacted':  'contacted',
  'completed':  'completed',
}

/** GET: サンプルCSVをダウンロード（?scope=store の場合は店舗コード列を除外） */
export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scope = new URL(req.url).searchParams.get('scope')
  const includeStoreCode = scope !== 'store'
  const columns = buildColumnMap(includeStoreCode)

  const headers = columns.map(c => c.required ? `${c.header}*` : c.header)
  const sampleBase: Record<string, string> = {
    storeCode:   '905b89bc',
    createdAt:   '2026/4/30 14:00',
    name:        '山田 太郎',
    furigana:    'ヤマダ タロウ',
    phone:       '090-1234-5678',
    email:       'yamada@example.com',
    postalCode:  '150-0001',
    address:     '東京都渋谷区...',
    inquiryType: '査定申し込み',
    details:     'ブランド品を査定したいです',
    status:      '新規',
  }
  const sample = columns.map(c => sampleBase[c.field] ?? '')
  const csv = buildCsv([headers, sample])

  const filename = includeStoreCode
    ? 'inquiries-import-template.csv'
    : 'inquiries-import-template-store.csv'

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

/** POST: CSV をパースして一括登録 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let csvText = ''
  let scopedStoreId: string | null = null
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
    }
    csvText = await file.text()
    const sid = formData.get('storeId')
    if (typeof sid === 'string' && sid) scopedStoreId = sid
  } else {
    const body = await req.json().catch(() => ({}))
    if (typeof body.csv === 'string') csvText = body.csv
    if (typeof body.storeId === 'string' && body.storeId) scopedStoreId = body.storeId
  }

  if (!csvText) return NextResponse.json({ error: 'CSV データが空です' }, { status: 400 })

  // 指定された店舗の存在確認
  if (scopedStoreId) {
    const exists = await prisma.store.findUnique({ where: { id: scopedStoreId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: '指定された店舗が存在しません' }, { status: 400 })
  }

  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'ヘッダー行とデータ行が必要です' }, { status: 400 })
  }

  const includeStoreCode = !scopedStoreId
  const columns = buildColumnMap(includeStoreCode)

  // ヘッダー行のマッピング（末尾の * は除去）
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const headerToIndex: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) headerToIndex[headerRow[i]] = i

  const missingRequired = columns
    .filter(c => c.required && !(c.header in headerToIndex))
    .map(c => c.header)
  if (missingRequired.length > 0) {
    return NextResponse.json({ error: `必須列が見つかりません: ${missingRequired.join(', ')}` }, { status: 400 })
  }

  // 店舗コード→storeId のキャッシュ（一括検索）
  const storeMap = new Map<string, string>()
  if (includeStoreCode) {
    const codeIdx = headerToIndex['店舗コード']
    const codes = new Set<string>()
    for (let r = 1; r < rows.length; r++) {
      const c = (rows[r][codeIdx] ?? '').trim()
      if (c) codes.add(c)
    }
    if (codes.size > 0) {
      const stores = await prisma.store.findMany({
        where: { code: { in: [...codes] } },
        select: { id: true, code: true },
      })
      for (const s of stores) storeMap.set(s.code, s.id)
    }
  }

  const errors: { row: number; message: string }[] = []
  const records: Array<Parameters<typeof prisma.inquiry.create>[0]['data']> = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const get = (header: string) => {
      const idx = headerToIndex[header]
      return idx === undefined ? '' : (row[idx] ?? '').trim()
    }
    let invalid = false

    // storeId 解決
    let storeId = scopedStoreId
    if (!storeId) {
      const code = get('店舗コード')
      if (!code) {
        errors.push({ row: r + 1, message: '店舗コードが空です' })
        invalid = true
      } else {
        const id = storeMap.get(code)
        if (!id) {
          errors.push({ row: r + 1, message: `店舗コード "${code}" が見つかりません` })
          invalid = true
        } else {
          storeId = id
        }
      }
    }

    const name = get('氏名')
    const furigana = get('フリガナ')
    const phone = get('電話').replace(/[-ー\s]/g, '')
    const inquiryType = get('申込内容')
    if (!name) { errors.push({ row: r + 1, message: '氏名が空です' }); invalid = true }
    if (!furigana) { errors.push({ row: r + 1, message: 'フリガナが空です' }); invalid = true }
    if (!phone) { errors.push({ row: r + 1, message: '電話が空です' }); invalid = true }
    if (!inquiryType) { errors.push({ row: r + 1, message: '申込内容が空です' }); invalid = true }

    // 受付日時
    let createdAt: Date | undefined = undefined
    const dateRaw = get('受付日時')
    if (dateRaw) {
      const d = new Date(dateRaw.replace(/\//g, '-'))
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: r + 1, message: `受付日時が不正な形式: "${dateRaw}"` })
        invalid = true
      } else {
        createdAt = d
      }
    }

    // ステータス
    const statusRaw = get('ステータス')
    let status = 'new'
    if (statusRaw) {
      const s = STATUS_FROM_LABEL[statusRaw]
      if (!s) {
        errors.push({ row: r + 1, message: `ステータスが不正: "${statusRaw}"（"新規/対応中/完了"）` })
        invalid = true
      } else {
        status = s
      }
    }

    if (invalid) continue

    records.push({
      storeId: storeId!,
      name,
      furigana,
      phone,
      email: get('メール') || null,
      postalCode: get('郵便番号') || null,
      address: get('住所') || '',
      inquiryType,
      details: get('相談内容') || null,
      status,
      ...(createdAt ? { createdAt } : {}),
    } as any)
  }

  if (errors.length > 0 && records.length === 0) {
    return NextResponse.json({ created: 0, errors }, { status: 400 })
  }

  let created = 0
  try {
    const result = await prisma.$transaction(
      records.map(data => prisma.inquiry.create({ data }))
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
