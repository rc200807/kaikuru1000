import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 管理者メンバー削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 自分自身は削除不可
  if (id === sessionUser.id) {
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

  await prisma.admin.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
