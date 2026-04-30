import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/line/users?channelId=xxx — LINE ユーザー一覧（全チャネル or 指定チャネル）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get('channelId') // LineChannel.id（内部ID）

  const lineUsers = await prisma.lineUser.findMany({
    where: channelId ? { lineChannelId: channelId } : undefined,
    include: {
      lineChannel: { select: { id: true, name: true } },
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
      ...(channelId ? { lineChannelId: channelId } : {}),
      direction: 'inbound',
      readAt: null,
    },
    _count: { id: true },
  })
  const unreadMap = Object.fromEntries(
    unreadCounts.map((u) => [u.lineUserId, u._count.id])
  )

  const result = lineUsers.map((lu) => ({
    id: lu.id,
    lineUserId: lu.lineUserId,
    displayName: lu.displayName,
    pictureUrl: lu.pictureUrl,
    channel: lu.lineChannel,
    linkedUser: lu.user,
    lastMessage: lu.messages[0] ?? null,
    unreadCount: unreadMap[lu.id] ?? 0,
    updatedAt: lu.updatedAt,
  }))

  return NextResponse.json(result)
}
