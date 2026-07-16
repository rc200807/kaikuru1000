import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

// ID+パスワード方式アカウントの承認（superadmin のみ）
// pending_approval のときだけ active に前進させる
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'superadmin') {
    return NextResponse.json({ error: '承認権限がありません（superadminのみ）' }, { status: 403 })
  }

  const { id } = await params
  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target || target.role === 'sysadmin') {
    return NextResponse.json({ error: '対象の管理者が見つかりません' }, { status: 404 })
  }
  if (target.authMethod !== 'idpass') {
    return NextResponse.json({ error: 'この管理者は承認の対象ではありません' }, { status: 400 })
  }
  if (target.status !== 'pending_approval') {
    return NextResponse.json({ error: 'この管理者は承認待ちの状態ではありません' }, { status: 400 })
  }

  const updated = await prisma.admin.update({
    where: { id },
    data: { status: 'active', approvedById: user.id, approvedAt: new Date() },
    select: {
      id: true, name: true, email: true, loginId: true, role: true,
      authMethod: true, status: true, approvedAt: true, createdAt: true,
    },
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `管理者を承認「${updated.name}」`, req: request,
  })

  return NextResponse.json(updated)
}
