import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  defaultUnitPrice: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})

/** 請求項目マスタの更新（名称・既定単価・補足・有効/無効） */
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

  const item = await prisma.workItemMaster.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: '請求項目が見つかりません' }, { status: 404 })

  if (parsed.data.name && parsed.data.name !== item.name) {
    const dup = await prisma.workItemMaster.findUnique({ where: { name: parsed.data.name } })
    if (dup) return NextResponse.json({ error: '同名の請求項目が既に存在します' }, { status: 400 })
  }

  const data = { ...parsed.data, notes: parsed.data.notes === '' ? null : parsed.data.notes }
  const updated = await prisma.workItemMaster.update({ where: { id }, data })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `請求項目マスタを更新「${updated.name}」`, req: request })
  return NextResponse.json(updated)
}

/**
 * 請求項目マスタの削除。
 * 既存の案件明細（WorkItem）は masterId が SetNull になり、workName スナップショットで表示継続。
 * 参照がある場合は 409 を返し、UI側で「無効化を推奨」の確認に使う（?force=1 で強制削除）。
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const item = await prisma.workItemMaster.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { workItems: true } } },
  })
  if (!item) return NextResponse.json({ error: '請求項目が見つかりません' }, { status: 404 })

  const force = new URL(request.url).searchParams.get('force') === '1'
  if (item._count.workItems > 0 && !force) {
    return NextResponse.json({
      requiresConfirm: true,
      referenceCount: item._count.workItems,
      message: `この請求項目は${item._count.workItems}件の案件明細で使用されています。削除ではなく無効化を推奨します。`,
    }, { status: 409 })
  }

  await prisma.workItemMaster.delete({ where: { id } })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `請求項目マスタを削除「${item.name}」`, req: request })
  return NextResponse.json({ ok: true })
}
