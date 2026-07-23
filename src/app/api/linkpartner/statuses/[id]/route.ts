import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartnerAdmin } from '@/lib/link-partner-auth'

const patchSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// 対応ステータス定義の編集（partner_admin のみ・自組織）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const owned = await prisma.linkPartnerStatus.findFirst({
    where: { id, linkPartnerId: user.linkPartnerId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await prisma.linkPartnerStatus.update({
    where: { id },
    data: parsed.data,
    select: { id: true, targetType: true, label: true, color: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json(updated)
}

// 対応ステータス定義の削除（partner_admin のみ）。付与済みレコードは SetNull（未設定に戻る）。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await prisma.linkPartnerStatus.findFirst({
    where: { id, linkPartnerId: user.linkPartnerId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.linkPartnerStatus.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
