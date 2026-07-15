import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOperatorStores, isOrgAdmin } from '@/lib/store-scope'

/** 運営者配下・全店舗のメンバー一覧（組織管理者のみ） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionStoreId = user.id as string

  const [{ operator, stores }, orgAdmin] = await Promise.all([
    getOperatorStores(sessionStoreId),
    isOrgAdmin({ id: sessionStoreId, memberId: user.memberId ?? null }),
  ])
  if (!operator) return NextResponse.json({ error: '運営者が登録されていません' }, { status: 404 })
  if (!orgAdmin) return NextResponse.json({ error: '組織管理者の権限が必要です' }, { status: 403 })

  const members = await prisma.storeMember.findMany({
    where: { storeId: { in: stores.map(s => s.id) } },
    orderBy: [{ storeId: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      orgRole: true,
      createdAt: true,
      store: { select: { id: true, name: true, code: true } },
    },
  })

  return NextResponse.json({ members })
}
