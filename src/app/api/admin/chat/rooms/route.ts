import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminContext, unreadCountForRoom } from '@/lib/chat'

export type ChatRoomListItem = {
  storeId: string
  storeName: string
  storeCode: string
  roomId: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
}

/** 全店舗のチャットルーム一覧（最新メッセージ・未読件数付き） */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = request.nextUrl.searchParams.get('search')?.trim() || ''

  // 本番は PostgreSQL のため mode:'insensitive' で大文字小文字を無視した検索。
  // （ローカル SQLite ビルドの型定義には mode が無いため any キャストで吸収する）
  const searchFilter = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }
    : {}

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...(searchFilter as Record<string, unknown>),
    },
    select: {
      id: true,
      name: true,
      code: true,
      chatRoom: { select: { id: true, lastMessageAt: true } },
    },
    orderBy: { name: 'asc' },
  })

  const items: ChatRoomListItem[] = await Promise.all(
    stores.map(async (s) => {
      const room = s.chatRoom
      if (!room) {
        return {
          storeId: s.id,
          storeName: s.name,
          storeCode: s.code,
          roomId: null,
          lastMessageAt: null,
          lastMessagePreview: null,
          unreadCount: 0,
        }
      }
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.chatMessage.findFirst({
          where: { roomId: room.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { body: true, attachments: true, authorType: true, authorName: true },
        }),
        unreadCountForRoom(room.id, 'admin', ctx.readerId),
      ])
      let preview: string | null = null
      if (lastMessage) {
        const hasAttachment = lastMessage.attachments && lastMessage.attachments !== '[]'
        preview = lastMessage.body?.trim() || (hasAttachment ? '📎 添付ファイル' : '')
      }
      return {
        storeId: s.id,
        storeName: s.name,
        storeCode: s.code,
        roomId: room.id,
        lastMessageAt: room.lastMessageAt ? room.lastMessageAt.toISOString() : null,
        lastMessagePreview: preview,
        unreadCount,
      }
    }),
  )

  // 未読 > 最新メッセージ日時 > 店舗名 の順で並べる
  items.sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1
    if (a.lastMessageAt) return -1
    if (b.lastMessageAt) return 1
    return a.storeName.localeCompare(b.storeName, 'ja')
  })

  return NextResponse.json({ rooms: items })
}
