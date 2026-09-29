import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { canApproveLoginRequests, LOGIN_REQUEST_APPROVED_MS } from '@/lib/admin-login-request'

/**
 * ログインリクエストの承認 / 却下（admin/superadmin のみ）。body: { action: 'approve' | 'reject' }
 * 承認待ち・期限内のものだけを対象にアトミックに更新する（複数の承認者が同時に押しても1回だけ効く）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !canApproveLoginRequests(user?.role)) {
    return NextResponse.json({ error: 'ログインリクエストの承認権限がありません' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: '不正な操作です' }, { status: 400 })
  }

  const target = await prisma.adminLoginRequest.findUnique({
    where: { id },
    select: { id: true, adminId: true, admin: { select: { name: true } } },
  })
  if (!target) return NextResponse.json({ error: 'リクエストが見つかりません' }, { status: 404 })
  if (target.adminId === user.id) {
    return NextResponse.json({ error: '自分のログインリクエストは承認できません' }, { status: 403 })
  }

  const now = new Date()
  const updated = await prisma.adminLoginRequest.updateMany({
    where: { id, status: 'pending', expiresAt: { gt: now } },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      decidedById: user.id,
      decidedByName: user.name ?? null,
      decidedAt: now,
      // 承認後は申請端末がログインを確定するまでの短い猶予に切り替える
      ...(action === 'approve' ? { expiresAt: new Date(now.getTime() + LOGIN_REQUEST_APPROVED_MS) } : {}),
    },
  })
  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'このリクエストはすでに処理済みか、期限切れです' },
      { status: 409 },
    )
  }

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `ログインリクエストを${action === 'approve' ? '承認' : '却下'}「${target.admin.name}」`,
    req: request,
  })

  return NextResponse.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected' })
}
