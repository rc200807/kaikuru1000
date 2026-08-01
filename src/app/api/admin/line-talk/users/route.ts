import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/line-talk/users — 既定チャネルの LINE ユーザー一覧（店舗割当付き）
// ?storeId=xxx で店舗絞り込み、?unassigned=1 で未割当のみ
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true, name: true },
  })
  if (!channel) {
    return NextResponse.json({ channel: null, users: [] })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')
  const unassigned = searchParams.get('unassigned') === '1'

  const lineUsers = await prisma.lineUser.findMany({
    where: {
      lineChannelId: channel.id,
      ...(unassigned ? { storeId: null } : storeId ? { storeId } : {}),
    },
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
    where: { lineChannelId: channel.id, direction: 'inbound', readAt: null },
    _count: { id: true },
  })
  const unreadMap = Object.fromEntries(
    unreadCounts.map((u) => [u.lineUserId, u._count.id])
  )

  const users = lineUsers.map((lu) => ({
    id: lu.id,
    lineUserId: lu.lineUserId,
    displayName: lu.displayName,
    pictureUrl: lu.pictureUrl,
    store: lu.store,
    linkedUser: lu.user,
    isFollowing: lu.isFollowing,
    lastMessage: lu.messages[0] ?? null,
    unreadCount: unreadMap[lu.id] ?? 0,
    updatedAt: lu.updatedAt,
  }))

  return NextResponse.json({ channel, users })
}
