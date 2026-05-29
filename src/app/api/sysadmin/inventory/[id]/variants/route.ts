import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

const createSchema = z.object({
  sizeName: z.string().min(1).max(60),
  stock: z.number().int().min(0).default(0),
  sellingPrice: z.number().int().min(0).nullable().optional(),
})

const updateSchema = z.object({
  variantId: z.string().min(1),
  sizeName: z.string().min(1).max(60).optional(),
  stock: z.number().int().min(0).optional(),
  sellingPrice: z.number().int().min(0).nullable().optional(),
})

const deleteSchema = z.object({
  variantId: z.string().min(1),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const variant = await prisma.productVariant.create({
    data: { productId: id, sizeName: parsed.data.sizeName, stock: parsed.data.stock, sellingPrice: parsed.data.sellingPrice ?? null },
  })
  await prisma.product.update({ where: { id }, data: { hasVariants: true } })
  return NextResponse.json(variant, { status: 201 })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const { variantId, ...rest } = parsed.data
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } })
  if (!existing || existing.productId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.productVariant.update({ where: { id: variantId }, data: rest })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const existing = await prisma.productVariant.findUnique({ where: { id: parsed.data.variantId } })
  if (!existing || existing.productId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.productVariant.delete({ where: { id: parsed.data.variantId } })

  const remaining = await prisma.productVariant.count({ where: { productId: id } })
  if (remaining === 0) {
    await prisma.product.update({ where: { id }, data: { hasVariants: false } })
  }
  return NextResponse.json({ ok: true })
}
