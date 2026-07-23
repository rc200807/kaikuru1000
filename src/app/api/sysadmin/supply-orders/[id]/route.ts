import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'

const updateSchema = z.object({
  status: z.enum(['pending', 'ordered']),
})

// 発注ステータス更新（未対応 ⇄ 発注済み）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const updated = await prisma.supplyOrder.update({
    where: { id },
    data: { status: parsed.data.status },
    include: { items: true },
  })
  const statusLabel = parsed.data.status === 'ordered' ? '発注済み' : '未対応'
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `発注ステータス更新 ${updated.orderNumber}→${statusLabel}`, req })
  return NextResponse.json(updated)
}

// 発注削除（明細 SupplyOrderItem は onDelete: Cascade で連動削除）
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const existing = await prisma.supplyOrder.findUnique({ where: { id }, select: { orderNumber: true } })
  if (!existing) return NextResponse.json({ error: '発注が見つかりません' }, { status: 404 })

  await prisma.supplyOrder.delete({ where: { id } })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `発注削除 ${existing.orderNumber}`, req })
  return NextResponse.json({ ok: true })
}
