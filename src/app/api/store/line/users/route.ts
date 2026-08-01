import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'

// GET /api/store/line/users — 自店舗（スコープ内店舗）に割り当てられた LINE ユーザー一覧
// ?storeIds=a,b,c で運営者配下の複数店舗を横断表示（同一運営者所属をサーバ側で検証）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const scope = await resolveStoreScope(user.id as string, request.nextUrl.searchParams.get('storeIds'))

  // セッション店舗のコード（LINE登録URL・QRコード表示用）
  const sessionStore = await prisma.store.findUnique({
    where: { id: user.id as string },
    select: { code: true },
  })

  const lineUsers = await prisma.lineUser.findMany({
    where: { storeId: { in: scope.storeIds } },
    include: {
      store: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, furigana: true, phone: true } },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { content: true, sentAt: true, direction: true, messageType: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // 未読数を取得
  const unreadCounts = await prisma.lineMessage.groupBy({
    by: ['lineUserId'],
    where: {
      lineUser: { storeId: { in: scope.storeIds } },
      direction: 'inbound',
      readAt: null,
    },
    _count: { id: true },
  })
  const unreadMap = Object.fromEntries(
    unreadCounts.map((u) => [u.lineUserId, u._count.id])
  )

  const users = lineUsers.map((lu) => ({
    id: lu.id,
    displayName: lu.displayName,
    pictureUrl: lu.pictureUrl,
    store: lu.store,
    linkedUser: lu.user,
    isFollowing: lu.isFollowing,
    lastMessage: lu.messages[0] ?? null,
    unreadCount: unreadMap[lu.id] ?? 0,
    updatedAt: lu.updatedAt,
  }))

  return NextResponse.json({ users, isMulti: scope.isMulti, storeCode: sessionStore?.code ?? '' })
}
