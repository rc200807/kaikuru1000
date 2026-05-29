import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'

const updateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  category: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(120).optional(),
  amount: z.number().int().min(0).optional(),
  note: z.string().max(2000).nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const updated = await prisma.operatingCost.update({ where: { id }, data: parsed.data })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `運用コスト更新「${updated.label}」`, req })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const existing = await prisma.operatingCost.findUnique({ where: { id }, select: { label: true } })
  await prisma.operatingCost.delete({ where: { id } })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `運用コスト削除「${existing?.label ?? id}」`, req: _req })
  return NextResponse.json({ ok: true })
}
