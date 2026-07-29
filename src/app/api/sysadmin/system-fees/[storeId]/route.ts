import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

const putSchema = z.object({
  monthlyAmount: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean(),
  note: z.string().max(500).optional(),
})

// 店舗の月額システム利用料 設定を更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storeId } = await params
  const body = await request.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }, { status: 400 })
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  const { monthlyAmount, isActive, note } = parsed.data
  const setting = await prisma.systemFeeSetting.upsert({
    where: { storeId },
    create: { storeId, monthlyAmount, isActive, note: note || null, updatedByName: admin.name },
    update: { monthlyAmount, isActive, note: note || null, updatedByName: admin.name },
  })

  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料を設定（${store.name}: ¥${monthlyAmount.toLocaleString()}/月・${isActive ? '有効' : '無効'}）`,
    req: request,
  })
  return NextResponse.json(setting)
}
