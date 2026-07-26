import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
})

/** 空き家管理項目マスタの更新（名称変更・有効/無効切替） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  }

  const item = await prisma.akiyaManagementItem.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })

  if (parsed.data.name && parsed.data.name !== item.name) {
    const dup = await prisma.akiyaManagementItem.findUnique({ where: { name: parsed.data.name } })
    if (dup) return NextResponse.json({ error: '同名の項目が既に存在します' }, { status: 400 })
  }

  const updated = await prisma.akiyaManagementItem.update({ where: { id }, data: parsed.data })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `空き家管理項目を更新「${updated.name}」`, req: request })
  return NextResponse.json(updated)
}

/**
 * 空き家管理項目マスタの削除。
 * 既存記録の明細（AkiyaRecordItem）は itemMasterId が SetNull になり、itemName スナップショットで表示継続。
 * レスポンスに参照件数を含め、UI側で「既存記録あり→無効化推奨」の確認に使う（?force=1 で強制削除）。
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const item = await prisma.akiyaManagementItem.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { recordItems: true } } },
  })
  if (!item) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })

  const force = new URL(request.url).searchParams.get('force') === '1'
  if (item._count.recordItems > 0 && !force) {
    return NextResponse.json({
      requiresConfirm: true,
      referenceCount: item._count.recordItems,
      message: `この項目は${item._count.recordItems}件の記録で使用されています。削除ではなく無効化を推奨します。`,
    }, { status: 409 })
  }

  await prisma.akiyaManagementItem.delete({ where: { id } })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `空き家管理項目を削除「${item.name}」`, req: request })
  return NextResponse.json({ ok: true })
}
