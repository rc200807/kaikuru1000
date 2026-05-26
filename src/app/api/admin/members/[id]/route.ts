import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ADMIN_ROLES } from '@/lib/admin-auth'

async function requireAnyAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) return null
  return user as { id: string; role: 'admin' | 'superadmin' | 'hr' }
}

const patchSchema = z.object({
  role: z.enum(['admin', 'superadmin', 'hr']),
})

// 管理者メンバー削除（superadmin のみ）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAnyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return NextResponse.json({ error: '管理者の削除権限がありません' }, { status: 403 })
  }

  const { id } = await params

  // 自分自身は削除不可
  if (id === user.id) {
    return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })
  }

  // 最後の1人は削除不可
  const count = await prisma.admin.count()
  if (count <= 1) {
    return NextResponse.json({ error: '管理者が1名のみのため削除できません' }, { status: 400 })
  }

  const admin = await prisma.admin.findUnique({ where: { id } })
  if (!admin) {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  // 最後の管理権限保有者（admin / superadmin）は削除不可
  if (admin.role === 'admin' || admin.role === 'superadmin') {
    const fullPowerCount = await prisma.admin.count({ where: { role: { in: ['admin', 'superadmin'] } } })
    if (fullPowerCount <= 1) {
      return NextResponse.json({ error: '最後の管理者（admin/superadmin）は削除できません' }, { status: 400 })
    }
  }

  await prisma.admin.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// 管理者メンバーのロール変更（admin / superadmin）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAnyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return NextResponse.json({ error: 'ロール変更の権限がありません' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const newRole = parsed.data.role

  // 自分自身のロール変更は不可（誤操作防止 + ロックアウト防止）
  if (id === user.id) {
    return NextResponse.json({ error: '自分自身のロールは変更できません' }, { status: 400 })
  }

  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  // 最後の管理権限保有者（admin/superadmin）から hr への降格は不可
  if ((target.role === 'admin' || target.role === 'superadmin') && newRole === 'hr') {
    const fullPowerCount = await prisma.admin.count({ where: { role: { in: ['admin', 'superadmin'] } } })
    if (fullPowerCount <= 1) {
      return NextResponse.json({ error: '最後の管理者（admin/superadmin）は降格できません' }, { status: 400 })
    }
  }

  const updated = await prisma.admin.update({
    where: { id },
    data: { role: newRole },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })
  return NextResponse.json(updated)
}
