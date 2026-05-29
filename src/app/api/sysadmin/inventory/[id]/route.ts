import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  purchasePrice: z.number().int().min(0).optional(),
  sellingPrice: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  hasVariants: z.boolean().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  supplierUrl: z.string().max(500).nullable().optional(),
  supplierEmail: z.string().email().nullable().optional().or(z.literal('')),
  supplierNote: z.string().max(2000).nullable().optional(),
})

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: { orderBy: { createdAt: 'asc' } } },
  })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const data: any = { ...parsed.data }
  if (data.supplierEmail === '') data.supplierEmail = null

  const updated = await prisma.product.update({
    where: { id },
    data,
    include: { variants: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await prisma.product.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
