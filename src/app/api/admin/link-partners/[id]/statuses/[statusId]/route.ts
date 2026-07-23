import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

const patchSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// 対応ステータス定義の編集（本部）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; statusId: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, statusId } = await ctx.params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const owned = await prisma.linkPartnerStatus.findFirst({ where: { id: statusId, linkPartnerId: id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await prisma.linkPartnerStatus.update({
    where: { id: statusId },
    data: parsed.data,
    select: { id: true, targetType: true, label: true, color: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json(updated)
}

// 対応ステータス定義の削除（本部）。付与済みレコードは SetNull。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; statusId: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, statusId } = await ctx.params
  const owned = await prisma.linkPartnerStatus.findFirst({ where: { id: statusId, linkPartnerId: id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.linkPartnerStatus.delete({ where: { id: statusId } })
  return NextResponse.json({ ok: true })
}
