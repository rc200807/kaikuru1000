import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM 形式で入力してください'),
  category: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  amount: z.number().int().min(0),
  note: z.string().max(2000).nullable().optional(),
})

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const costs = await prisma.operatingCost.findMany({
    orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(costs)
}

export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const cost = await prisma.operatingCost.create({
    data: { ...parsed.data, note: parsed.data.note ?? null },
  })
  return NextResponse.json(cost, { status: 201 })
}
