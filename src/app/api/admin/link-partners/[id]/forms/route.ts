import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { z } from 'zod'

// 割当済みフォームID + 割当可能な全フォーム（ピッカー用）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const [assigned, forms] = await Promise.all([
    prisma.linkPartnerForm.findMany({ where: { linkPartnerId: id }, select: { formId: true } }),
    prisma.form.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        internalName: true,
        slug: true,
        status: true,
        _count: { select: { submissions: true } },
      },
    }),
  ])
  return NextResponse.json({ assignedFormIds: assigned.map((a) => a.formId), forms })
}

const assignSchema = z.object({ formIds: z.array(z.string()).min(1) })

// フォームを割り当てる（既に割当済みのものはスキップ）
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const exists = await prisma.linkPartner.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = assignSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  // 実在するフォームに限定
  const forms = await prisma.form.findMany({
    where: { id: { in: parsed.data.formIds } },
    select: { id: true },
  })
  const validIds = forms.map((f) => f.id)

  // 既に割当済みのものを除外
  const existing = await prisma.linkPartnerForm.findMany({
    where: { linkPartnerId: id, formId: { in: validIds } },
    select: { formId: true },
  })
  const existingSet = new Set(existing.map((e) => e.formId))
  const toAdd = validIds.filter((fid) => !existingSet.has(fid))

  if (toAdd.length > 0) {
    await prisma.linkPartnerForm.createMany({
      data: toAdd.map((formId) => ({ linkPartnerId: id, formId, assignedByAdminId: user.id })),
    })
  }
  return NextResponse.json({ added: toAdd.length })
}

// フォーム割当を解除（?formId=...）。結合行のみ削除し Form 本体は不変。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const formId = new URL(req.url).searchParams.get('formId')
  if (!formId) return NextResponse.json({ error: 'formId が必要です' }, { status: 400 })
  await prisma.linkPartnerForm.deleteMany({ where: { linkPartnerId: id, formId } })
  return NextResponse.json({ ok: true })
}
