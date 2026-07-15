import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isOrgAdmin } from '@/lib/store-scope'
import { recordAccessLog } from '@/lib/access-log'

/** メンバーの組織管理者権限（orgRole）を付与/剥奪（組織管理者のみ） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionStoreId = user.id as string
  const { id } = await params

  const orgAdmin = await isOrgAdmin({ id: sessionStoreId, memberId: user.memberId ?? null })
  if (!orgAdmin) return NextResponse.json({ error: '組織管理者の権限が必要です' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const orgRole = body?.orgRole
  if (orgRole !== 'admin' && orgRole !== null) {
    return NextResponse.json({ error: 'orgRole は "admin" または null を指定してください' }, { status: 400 })
  }

  // 対象メンバーがセッション店舗と同一運営者の配下であることを検証
  const [target, sessionStore] = await Promise.all([
    prisma.storeMember.findUnique({
      where: { id },
      select: { id: true, name: true, store: { select: { id: true, name: true, operatorId: true } } },
    }),
    prisma.store.findUnique({ where: { id: sessionStoreId }, select: { operatorId: true } }),
  ])
  if (!target) return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  if (!sessionStore?.operatorId || target.store.operatorId !== sessionStore.operatorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.storeMember.update({
    where: { id },
    data: { orgRole },
    select: { id: true, orgRole: true },
  })

  await recordAccessLog({
    userType: 'store',
    userId: sessionStoreId,
    userName: (user.memberName as string) || (user.name as string) || '店舗',
    memberId: (user.memberId as string) ?? null,
    action: `組織管理者権限を${orgRole === 'admin' ? '付与' : '解除'}: ${target.name}（${target.store.name}）`,
    req: request,
  })

  return NextResponse.json(updated)
}
