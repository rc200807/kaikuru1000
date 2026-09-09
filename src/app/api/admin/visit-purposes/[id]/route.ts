import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) return null
  return user
}

/** 訪問目的マスタの更新（名称・並び順・有効/無効） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.visitPurpose.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '訪問目的が見つかりません' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const data: { name?: string; sortOrder?: number; isActive?: boolean } = {}

  if (typeof body?.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: '訪問目的を入力してください' }, { status: 400 })
    if (name.length > 50) return NextResponse.json({ error: '訪問目的は50文字以内にしてください' }, { status: 400 })
    if (name !== existing.name) {
      const dup = await prisma.visitPurpose.findUnique({ where: { name } })
      if (dup) return NextResponse.json({ error: '同名の訪問目的が既に存在します' }, { status: 400 })
    }
    data.name = name
  }
  if (typeof body?.sortOrder === 'number') data.sortOrder = Math.trunc(body.sortOrder)
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
  }

  const updated = await prisma.visitPurpose.update({ where: { id }, data })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `訪問目的を更新「${updated.name}」`, req: request })
  return NextResponse.json(updated)
}

/**
 * 訪問目的マスタの削除。
 * 訪問に紐づいていても消せる（VisitSchedule.purposeId は SetNull、
 * purposeName にスナップショットが残るため過去の記録は失われない）。
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.visitPurpose.findUnique({ where: { id }, select: { name: true } })
  if (!existing) return NextResponse.json({ error: '訪問目的が見つかりません' }, { status: 404 })

  await prisma.visitPurpose.delete({ where: { id } })
  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `訪問目的を削除「${existing.name}」`, req: request })
  return NextResponse.json({ deleted: true })
}
