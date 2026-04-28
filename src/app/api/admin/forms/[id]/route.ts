import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { normalizeCustomSlug } from '@/lib/forms/slug'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') return null
  return user
}

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
  return NextResponse.json({ ...form, submissionCount: form._count.submissions, _count: undefined })
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

  const updated = await prisma.form.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.form.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
