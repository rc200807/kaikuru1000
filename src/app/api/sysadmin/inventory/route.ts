import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'

const variantSchema = z.object({
  sizeName: z.string().min(1).max(60),
  stock: z.number().int().min(0).default(0),
  sellingPrice: z.number().int().min(0).nullable().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(120),
  purchasePrice: z.number().int().min(0),
  sellingPrice: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
  hasVariants: z.boolean().default(false),
  imageUrl: z.string().max(1000).nullable().optional(),
  supplierUrl: z.string().max(500).nullable().optional(),
  supplierEmail: z.string().email().nullable().optional().or(z.literal('')),
  supplierNote: z.string().max(2000).nullable().optional(),
  variants: z.array(variantSchema).optional(),
})

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const products = await prisma.product.findMany({
    include: { variants: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const { variants, supplierEmail, ...rest } = parsed.data
  const data: any = { ...rest }
  if (supplierEmail === '' || supplierEmail === undefined) data.supplierEmail = null
  else data.supplierEmail = supplierEmail

  const product = await prisma.product.create({
    data: {
      ...data,
      variants: variants && variants.length > 0
        ? { create: variants.map(v => ({ sizeName: v.sizeName, stock: v.stock, sellingPrice: v.sellingPrice ?? null })) }
        : undefined,
    },
    include: { variants: true },
  })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `備品登録「${product.name}」`, req })
  return NextResponse.json(product, { status: 201 })
}
