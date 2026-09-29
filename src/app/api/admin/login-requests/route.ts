import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canApproveLoginRequests, loginRequestState } from '@/lib/admin-login-request'

export type AdminLoginRequestItem = {
  id: string
  code: string
  status: string
  ip: string | null
  userAgent: string | null
  decidedByName: string | null
  decidedAt: string | null
  expiresAt: string
  createdAt: string
  admin: { id: string; name: string; loginId: string | null; role: string }
}

const SELECT = {
  id: true, code: true, status: true, ip: true, userAgent: true,
  decidedByName: true, decidedAt: true, expiresAt: true, createdAt: true,
  admin: { select: { id: true, name: true, loginId: true, role: true } },
} as const

/**
 * ログインリクエスト一覧（承認者＝admin/superadmin のみ）。
 * 既定は承認待ちのみ（全画面の通知から10秒おきに呼ばれるため軽く保つ）。
 * ?history=1 で直近の処理済み（承認/却下/期限切れ等）も返す（メンバー管理画面用）。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !canApproveLoginRequests(user?.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const now = new Date()
  const pendingRows = await prisma.adminLoginRequest.findMany({
    // 自分自身のリクエストは承認できないので出さない
    where: { status: 'pending', expiresAt: { gt: now }, adminId: { not: user.id } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: SELECT,
  })

  const withHistory = request.nextUrl.searchParams.get('history') === '1'
  const historyRows = withHistory
    ? await prisma.adminLoginRequest.findMany({
        where: { NOT: { status: 'pending', expiresAt: { gt: now } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: SELECT,
      })
    : []

  const toItem = (r: (typeof pendingRows)[number]): AdminLoginRequestItem => ({
    ...r,
    // 期限切れは保存値ではなく期限から導出
    status: loginRequestState(r),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  })

  return NextResponse.json({
    pending: pendingRows.map(toItem),
    history: historyRows.map(toItem),
  })
}
