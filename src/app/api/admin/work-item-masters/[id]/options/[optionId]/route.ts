import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

const patchSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
})

async function loadOption(masterId: string, optionId: string) {
  const option = await prisma.workItemOption.findUnique({ where: { id: optionId } })
  if (!option || option.masterId !== masterId) return null
  return option
}

/** チェック項目の更新（名称変更・有効/無効切替） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, optionId } = await params
  const option = await loadOption(id, optionId)
  if (!option) return NextResponse.json({ error: 'チェック項目が見つかりません' }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  }

  if (parsed.data.label && parsed.data.label !== option.label) {
    const dup = await prisma.workItemOption.findFirst({ where: { masterId: id, label: parsed.data.label } })
    if (dup) return NextResponse.json({ error: '同名のチェック項目が既に存在します' }, { status: 400 })
  }

  const updated = await prisma.workItemOption.update({ where: { id: optionId }, data: parsed.data })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `チェック項目を更新「${updated.label}」`, req: request })
  return NextResponse.json(updated)
}

/**
 * チェック項目の削除。
 * 既存明細のチェック結果は optionId が SetNull になり、label スナップショットで備考の表示が続く。
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, optionId } = await params
  const option = await loadOption(id, optionId)
  if (!option) return NextResponse.json({ error: 'チェック項目が見つかりません' }, { status: 404 })

  await prisma.workItemOption.delete({ where: { id: optionId } })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `チェック項目を削除「${option.label}」`, req: request })
  return NextResponse.json({ ok: true })
}
