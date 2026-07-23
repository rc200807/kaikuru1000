// チャット・LINE の活動量集計API。
// プライバシー配慮のため本文・氏名は一切返さない（件数・日時ベースの統計のみ）。
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { aggregateDaily, sinceDays, sinceHours } from '@/lib/sysadmin-metrics'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const h24 = sinceHours(24)
  const d7 = sinceDays(7)
  const d30 = sinceDays(30)

  const [
    chat24h, chat7d, chatDailyRows, chatActiveRooms, chatRoomsWithLastMessage,
    line24h, line7d, lineDailyRows, lineByDirection, lineFailed, lineByChannel, lineChannels,
  ] = await Promise.all([
    prisma.chatMessage.count({ where: { deletedAt: null, createdAt: { gte: h24 } } }),
    prisma.chatMessage.count({ where: { deletedAt: null, createdAt: { gte: d7 } } }),
    prisma.chatMessage.findMany({ where: { deletedAt: null, createdAt: { gte: d30 } }, select: { createdAt: true } }),
    prisma.chatMessage.groupBy({ by: ['roomId'], where: { deletedAt: null, createdAt: { gte: d7 } } }),
    prisma.chatRoom.findMany({
      where: { lastMessageAt: { not: null, lt: h24 } },
      select: {
        id: true,
        lastMessageAt: true,
        readStates: { where: { readerType: 'admin' }, select: { lastReadAt: true } },
      },
    }),
    prisma.lineMessage.count({ where: { sentAt: { gte: h24 } } }),
    prisma.lineMessage.count({ where: { sentAt: { gte: d7 } } }),
    prisma.lineMessage.findMany({ where: { sentAt: { gte: d30 } }, select: { sentAt: true } }),
    prisma.lineMessage.groupBy({ by: ['direction'], where: { sentAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.lineMessage.count({ where: { status: 'failed' } }),
    prisma.lineMessage.groupBy({ by: ['lineChannelId'], where: { sentAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.lineChannel.findMany({ select: { id: true, name: true, isActive: true } }),
  ])

  // 未読滞留: 最終メッセージが24時間より前で、本部側の既読がそれに追いついていないルーム数
  const staleUnreadRooms = chatRoomsWithLastMessage.filter(r => {
    if (!r.lastMessageAt) return false
    const maxRead = r.readStates.reduce<Date | null>(
      (max, s) => (max === null || s.lastReadAt > max ? s.lastReadAt : max),
      null,
    )
    return maxRead === null || maxRead < r.lastMessageAt
  }).length

  const channelName = new Map(lineChannels.map(c => [c.id, c.name]))

  return NextResponse.json({
    chat: {
      count24h: chat24h,
      count7d: chat7d,
      daily: aggregateDaily(chatDailyRows.map(r => r.createdAt), 30),
      activeRooms7d: chatActiveRooms.length,
      staleUnreadRooms,
    },
    line: {
      count24h: line24h,
      count7d: line7d,
      daily: aggregateDaily(lineDailyRows.map(r => r.sentAt), 30),
      byDirection: lineByDirection.map(d => ({ direction: d.direction, count: d._count._all })),
      failedCount: lineFailed,
      byChannel: lineByChannel.map(c => ({
        channelId: c.lineChannelId,
        channelName: channelName.get(c.lineChannelId) ?? '不明',
        count: c._count._all,
      })),
      channels: lineChannels,
    },
  })
}
