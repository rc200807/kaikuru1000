import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeCustomSlug } from '@/lib/forms/slug'
import { CUSTOMER_TYPES } from '@/lib/customer-types'
import { encrypt } from '@/lib/encrypt'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

const customerFieldMapSchema = z.object({
  name:       z.string().optional(),
  furigana:   z.string().optional(),
  email:      z.string().optional(),
  phone:      z.string().optional(),
  address:    z.string().optional(),
  postalCode: z.string().optional(),
}).partial()

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  schema: z.string().max(200000).optional(), // 既にJSON文字列で渡す
  status: z.enum(['draft', 'published', 'closed']).optional(),
  notifyEmails: z.string().max(500).nullable().optional(),
  successMessage: z.string().max(2000).nullable().optional(),
  sheetWebhookUrl: z.string().url().nullable().optional().or(z.literal('')),
  recaptchaEnabled: z.boolean().optional(),
  slug: z.string().min(2).max(50).optional(),
  // 顧客自動作成
  customerCreate: z.boolean().optional(),
  customerType: z.enum(CUSTOMER_TYPES).nullable().optional(),
  customerTypes: z.array(z.enum(CUSTOMER_TYPES)).nullable().optional(),
  customerFieldMap: customerFieldMapSchema.nullable().optional(),
  customerStoreId: z.string().nullable().optional(),
  // 外部API送信（汎用Webhook）
  externalApiEnabled: z.boolean().optional(),
  externalApiUrl: z.string().url().nullable().optional().or(z.literal('')),
  externalApiKey: z.string().optional(), // 生のAPIキー。非空のときのみ暗号化保存
  externalApiHeaders: z.string().max(10000).nullable().optional(),
  externalApiStaticFields: z.string().max(20000).nullable().optional(),
  externalApiFieldMap: z.record(z.string(), z.string()).nullable().optional(),
  externalApiNotifyEmails: z.string().max(1000).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const form = await prisma.form.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  })
  if (!form) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return NextResponse.json({
    ...form,
    submissionCount: form._count.submissions,
    _count: undefined,
    externalApiKeyEnc: undefined,
    externalApiKeySet: !!form.externalApiKeyEnc,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const data: any = { ...parsed.data }

  // schema が JSON として valid か検証
  if (typeof data.schema === 'string') {
    try {
      const arr = JSON.parse(data.schema)
      if (!Array.isArray(arr)) throw new Error()
    } catch {
      return NextResponse.json({ error: 'schema が不正です' }, { status: 400 })
    }
  }

  // slug 正規化＋ユニークチェック
  if (data.slug) {
    const norm = normalizeCustomSlug(data.slug)
    if (!norm) return NextResponse.json({ error: 'slug は半角英数とハイフンのみ使えます' }, { status: 400 })
    const exists = await prisma.form.findFirst({ where: { slug: norm, NOT: { id } } })
    if (exists) return NextResponse.json({ error: 'この slug は既に使われています' }, { status: 400 })
    data.slug = norm
  }

  if (data.sheetWebhookUrl === '') data.sheetWebhookUrl = null

  // 顧客自動作成: customerTypes と customerFieldMap は JSON 文字列に直列化
  if ('customerTypes' in data) {
    data.customerTypes = data.customerTypes && data.customerTypes.length > 0 ? JSON.stringify(data.customerTypes) : null
  }
  if ('customerFieldMap' in data) {
    data.customerFieldMap = data.customerFieldMap ? JSON.stringify(data.customerFieldMap) : null
  }
  if (data.customerStoreId === '') data.customerStoreId = null

  // 外部API送信設定
  if (data.externalApiUrl === '') data.externalApiUrl = null
  if (data.externalApiNotifyEmails === '') data.externalApiNotifyEmails = null
  if ('externalApiFieldMap' in data) {
    data.externalApiFieldMap = data.externalApiFieldMap && Object.keys(data.externalApiFieldMap).length > 0
      ? JSON.stringify(data.externalApiFieldMap) : null
  }
  // ヘッダー / 固定フィールドは JSON オブジェクトとして妥当か確認
  for (const key of ['externalApiHeaders', 'externalApiStaticFields'] as const) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      try {
        const o = JSON.parse(data[key])
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error()
      } catch {
        const label = key === 'externalApiHeaders' ? 'カスタムヘッダー' : '固定送信フィールド'
        return NextResponse.json({ error: `${label} は有効なJSONオブジェクトで入力してください` }, { status: 400 })
      }
    } else if (data[key] === '') {
      data[key] = null
    }
  }
  // API-Key: 非空のときのみ暗号化して保存（空＝既存維持＝SMTPパスワードと同じ挙動）
  if ('externalApiKey' in data) {
    const raw = data.externalApiKey
    delete data.externalApiKey
    if (typeof raw === 'string' && raw.trim()) {
      data.externalApiKeyEnc = encrypt(raw.trim())
    }
  }

  const updated = await prisma.form.update({ where: { id }, data })
  return NextResponse.json({ ...updated, externalApiKeyEnc: undefined, externalApiKeySet: !!updated.externalApiKeyEnc })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.form.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
