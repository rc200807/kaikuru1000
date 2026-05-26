import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { requireRole } from '@/lib/admin-auth'
import { encField, HIRE_TYPES, EMPLOYMENT_TYPES, RESIGN_TYPES, GENDERS, MARITAL_STATUSES } from '@/lib/employee-utils'

/**
 * CSV ヘッダー（日本語）→ Employee の入力フィールド名 のマッピング。
 * `encrypt: true` の項目は AES-256-GCM で暗号化して *Enc 列に保存する。
 */
type Column = {
  header: string
  field: string
  required?: boolean
  encrypt?: boolean
  enumValues?: readonly string[]
  date?: boolean
}

const COLUMN_MAP: Column[] = [
  { header: '従業員番号',           field: 'employeeNumber', required: true },
  { header: '苗字',                 field: 'lastName',       required: true },
  { header: '名前',                 field: 'firstName',      required: true },
  { header: '苗字フリガナ',         field: 'lastNameKana' },
  { header: '名前フリガナ',         field: 'firstNameKana' },
  { header: '入社年月日',           field: 'hireDate', date: true },
  { header: '入社区分',             field: 'hireType', enumValues: HIRE_TYPES },
  { header: '雇用形態',             field: 'employmentType', enumValues: EMPLOYMENT_TYPES },
  { header: '所属部署',             field: 'department' },
  { header: '肩書き',               field: 'jobTitle' },
  { header: '職種',                 field: 'jobCategory' },
  { header: '職務内容',             field: 'jobDescription' },
  { header: '退社年月日',           field: 'resignDate', date: true },
  { header: '退職区分',             field: 'resignType', enumValues: RESIGN_TYPES },
  { header: '性別',                 field: 'gender', enumValues: GENDERS },
  { header: '社用メール',           field: 'workEmail' },
  { header: '社用電話',             field: 'workPhone' },
  { header: '生年月日',             field: 'dateOfBirth', date: true },
  { header: '住所',                 field: 'address' },
  { header: '緊急連絡先',           field: 'emergencyContact' },
  { header: '個人電話',             field: 'personalPhone' },
  { header: '基礎年金番号',         field: 'basicPensionNumber', encrypt: true },
  { header: '健康保険番号',         field: 'healthInsuranceNumber', encrypt: true },
  { header: '雇用保険番号',         field: 'employmentInsuranceNumber', encrypt: true },
  { header: '在留カード番号',       field: 'residenceCardNumber', encrypt: true },
  { header: '給与振込先',           field: 'payrollBankInfo', encrypt: true },
  { header: '保有資格',             field: 'qualifications' },
  { header: '履歴書URL',            field: 'resumeDriveUrl' },
  { header: '名刺URL',              field: 'businessCardDriveUrl' },
  { header: 'プロフィール写真URL',  field: 'profilePhotoDriveUrl' },
  { header: '婚姻状況',             field: 'maritalStatus', enumValues: MARITAL_STATUSES },
]

const MARITAL_FROM_LABEL: Record<string, string> = {
  '未婚': 'single', 'single': 'single',
  '既婚': 'married', 'married': 'married',
}

function parseDateLike(v: string): Date | null {
  const t = v.trim()
  if (!t) return null
  // YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD
  const m1 = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m1) {
    const d = new Date(Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3])))
    return isNaN(d.getTime()) ? null : d
  }
  const m2 = t.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m2) {
    const d = new Date(Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/** GET: サンプルCSV ダウンロード */
export async function GET() {
  const user = await requireRole(['superadmin', 'admin', 'hr'])
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = COLUMN_MAP.map(c => (c.required ? `${c.header}*` : c.header))
  const sample = [
    '028', '山田', '太郎', 'ヤマダ', 'タロウ',
    '2024-04-01', '中途', '正社員', '営業部', 'マネージャー', '営業', '法人営業',
    '', '', '男性', 't.yamada@example.com', '090-1234-5678',
    '1990-05-20', '東京都渋谷区...', '配偶者 山田花子 090-0000-0000', '090-9999-8888',
    '1234-567890', '12345678', 'AB1234567890', 'AB12345678', 'みずほ銀行 渋谷支店 普通 1234567 ヤマダ タロウ',
    '日商簿記2級, TOEIC 800', 'https://drive.google.com/...', 'https://drive.google.com/...', 'https://drive.google.com/...',
    '既婚',
  ]
  const csv = buildCsv([headers, sample])
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="employees-import-template.csv"',
    },
  })
}

/** POST: CSV をパースして一括登録 */
export async function POST(req: NextRequest) {
  const user = await requireRole(['superadmin', 'admin', 'hr'])
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
  const seenNumbers = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    // 空行スキップ
    if (row.every(c => !c?.trim())) continue

    const get = (header: string) => {
      const idx = headerToIndex[header]
      return idx === undefined ? '' : (row[idx] ?? '').trim()
    }

    const rec: Record<string, unknown> = {}
    let invalid = false

    for (const col of COLUMN_MAP) {
      const raw = get(col.header)

      if (col.required && !raw) {
        errors.push({ row: r + 1, message: `${col.header} が空です` })
        invalid = true
        continue
      }
      if (!raw) {
        // 任意項目で空
        if (col.encrypt) {
          rec[`${col.field}Enc`] = null
        } else {
          rec[col.field] = null
        }
        continue
      }

      if (col.date) {
        const d = parseDateLike(raw)
        if (!d) {
          errors.push({ row: r + 1, message: `${col.header} の日付形式が不正: "${raw}"（YYYY-MM-DD）` })
          invalid = true
          continue
        }
        rec[col.field] = d
        continue
      }

      if (col.field === 'maritalStatus') {
        const m = MARITAL_FROM_LABEL[raw]
        if (!m) {
          errors.push({ row: r + 1, message: `婚姻状況が不正: "${raw}"（"未婚" or "既婚"）` })
          invalid = true
          continue
        }
        rec.maritalStatus = m
        continue
      }

      if (col.enumValues && !(col.enumValues as readonly string[]).includes(raw)) {
        errors.push({
          row: r + 1,
          message: `${col.header} が候補に含まれません: "${raw}"（候補: ${col.enumValues.join(' / ')}）`,
        })
        invalid = true
        continue
      }

      if (col.encrypt) {
        rec[`${col.field}Enc`] = encField(raw)
      } else {
        rec[col.field] = raw
      }
    }

    if (!invalid) {
      const num = String(rec.employeeNumber)
      if (seenNumbers.has(num)) {
        errors.push({ row: r + 1, message: `従業員番号が CSV 内で重複: "${num}"` })
      } else {
        seenNumbers.add(num)
        records.push(rec)
      }
    }
  }

  if (records.length === 0) {
    return NextResponse.json({ error: '登録できる行がありません', errors }, { status: 400 })
  }

  // 既存の employeeNumber と衝突する行をエラーにする
  const numbers = records.map(r => r.employeeNumber as string)
  const existing = await prisma.employee.findMany({
    where: { employeeNumber: { in: numbers } },
    select: { employeeNumber: true },
  })
  const existingSet = new Set(existing.map(e => e.employeeNumber))

  const created: { row: number; employeeNumber: string }[] = []
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const num = rec.employeeNumber as string
    if (existingSet.has(num)) {
      errors.push({ row: i + 2, message: `従業員番号 "${num}" は既に登録されています` })
      continue
    }
    try {
      const employee = await prisma.employee.create({ data: rec as any })
      created.push({ row: i + 2, employeeNumber: employee.employeeNumber })
    } catch (e: any) {
      errors.push({ row: i + 2, message: e?.message ?? '登録に失敗しました' })
    }
  }

  return NextResponse.json({ created: created.length, errors })
}
