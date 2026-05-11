import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { z } from 'zod'

const updateSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  email:    z.string().email().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const partner = await prisma.salesPartner.findUnique({
    where: { id },
    include: {
      invitedBy: { select: { id: true, name: true } },
      invitations: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { customerNotes: true } },
    },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { password, ...rest } = partner
  return NextResponse.json(rest)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const updated = await prisma.salesPartner.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, isActive: true, updatedAt: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin') {
    return NextResponse.json({ error: 'パートナーの削除は superadmin のみ実行できます' }, { status: 403 })
  }
  const { id } = await ctx.params
  await prisma.salesPartner.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
