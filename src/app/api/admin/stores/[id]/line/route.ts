import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/stores/[id]/line — 店舗に紐づく LINE チャネル・ユーザー・最終メッセージを返す
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: storeId } = await params

  // この店舗に紐づくLINEチャネル一覧
  const channels = await prisma.lineChannel.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      channelId: true,
      isActive: true,
      _count: { select: { lineUsers: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (channels.length === 0) {
    return NextResponse.json({ channels: [], lineUsers: [] })
  }

  const channelIds = channels.map(c => c.id)

  // 各チャネルの未読数を取得
  const unreadGrouped = await prisma.lineMessage.groupBy({
    by: ['lineChannelId'],
    where: { lineChannelId: { in: channelIds }, direction: 'inbound', readAt: null },
    _count: { id: true },
  })
  const unreadByChannel = Object.fromEntries(unreadGrouped.map(g => [g.lineChannelId, g._count.id]))

  // この店舗のチャネルに紐づくLINEユーザー（最終メッセージ付き）
  const lineUsers = await prisma.lineUser.findMany({
    where: { lineChannelId: { in: channelIds } },
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

  const unreadGroupedByUser = await prisma.lineMessage.groupBy({
    by: ['lineUserId'],
    where: { lineChannelId: { in: channelIds }, direction: 'inbound', readAt: null },
    _count: { id: true },
  })
  const unreadByUser = Object.fromEntries(unreadGroupedByUser.map(g => [g.lineUserId, g._count.id]))

  return NextResponse.json({
    channels: channels.map(ch => ({
      ...ch,
      userCount: ch._count.lineUsers,
      unreadCount: unreadByChannel[ch.id] ?? 0,
    })),
    lineUsers: lineUsers.map(lu => ({
      id: lu.id,
      lineUserId: lu.lineUserId,
      displayName: lu.displayName,
      pictureUrl: lu.pictureUrl,
      channel: lu.lineChannel,
      linkedUser: lu.user,
      lastMessage: lu.messages[0] ?? null,
      unreadCount: unreadByUser[lu.id] ?? 0,
      updatedAt: lu.updatedAt,
    })),
  })
}
