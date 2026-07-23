import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// パートナーの対応ステータス定義一覧（両targetType・本部が管理/閲覧）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const statuses = await prisma.linkPartnerStatus.findMany({
    where: { linkPartnerId: id },
    orderBy: [{ targetType: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, targetType: true, label: true, color: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json({ statuses })
}

const createSchema = z.object({
  targetType: z.enum(['inquiry', 'customer']),
  label: z.string().min(1, 'ステータス名は必須です').max(40),
  color: z.string().max(20).optional(),
})

// 対応ステータス定義を追加（本部）
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const exists = await prisma.linkPartner.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { targetType, label, color } = parsed.data
  const last = await prisma.linkPartnerStatus.findFirst({
    where: { linkPartnerId: id, targetType },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const created = await prisma.linkPartnerStatus.create({
    data: { linkPartnerId: id, targetType, label, color: color || null, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: { id: true, targetType: true, label: true, color: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json(created, { status: 201 })
}
