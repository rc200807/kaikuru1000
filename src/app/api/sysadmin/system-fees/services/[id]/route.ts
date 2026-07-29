import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

const patchSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  monthlyAmount: z.number().int().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

// 料金項目の更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }, { status: 400 })
  }

  const existing = await prisma.systemFeeService.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })

  const updated = await prisma.systemFeeService.update({ where: { id }, data: parsed.data })

  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料の項目を更新（${updated.label}: ¥${updated.monthlyAmount.toLocaleString()}/月・${updated.isActive ? '有効' : '無効'}）`,
    req: request,
  })
  return NextResponse.json(updated)
}

// 料金項目の削除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.systemFeeService.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })

  await prisma.systemFeeService.delete({ where: { id } })
  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料の項目を削除（${existing.label} [${existing.serviceKey}]）`, req: request,
  })
  return NextResponse.json({ deleted: true })
}
