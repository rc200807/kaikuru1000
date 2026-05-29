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
