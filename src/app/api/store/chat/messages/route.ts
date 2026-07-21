import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getStoreContext,
  getOrCreateRoom,
  getSerializedThread,
  getOtherPartyReadAt,
  markRoomRead,
  messageInclude,
  serializeMessage,
  parseAttachments,
  type ChatAttachment,
} from '@/lib/chat'
import { sanitizeChatHtml } from '@/lib/chat-sanitize'

/** 自店舗ルームのメッセージ一覧 */
export async function GET() {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const room = await getOrCreateRoom(ctx.storeId)
  const [messages, otherReadAt] = await Promise.all([
    getSerializedThread(room.id, ctx.storeId, ctx.viewer),
    getOtherPartyReadAt(room.id, 'store'),
  ])
  return NextResponse.json({ messages, otherReadAt })
}

/** メッセージ送信（本文 + 添付 + 任意の parentId でスレッド返信） */
export async function POST(request: NextRequest) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const text = sanitizeChatHtml(typeof body?.body === 'string' ? body.body : '')
  const attachments: ChatAttachment[] = parseAttachments(
    Array.isArray(body?.attachments) ? JSON.stringify(body.attachments) : undefined,
  )
  const parentId = typeof body?.parentId === 'string' ? body.parentId : null

  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: 'メッセージまたは添付を入力してください' }, { status: 400 })
  }

  const room = await getOrCreateRoom(ctx.storeId)

  // スレッド返信の場合は親が同ルームのトップレベルであることを確認
  if (parentId) {
    const parent = await prisma.chatMessage.findFirst({ where: { id: parentId, roomId: room.id } })
    if (!parent) return NextResponse.json({ error: '親メッセージが見つかりません' }, { status: 404 })
  }

  const created = await prisma.chatMessage.create({
    data: {
      roomId: room.id,
      parentId,
      authorType: 'store',
      authorMemberId: ctx.memberId,
      authorName: ctx.authorName,
      body: text,
      attachments: JSON.stringify(attachments),
    },
    include: messageInclude,
  })

  await Promise.all([
    prisma.chatRoom.update({ where: { id: room.id }, data: { lastMessageAt: created.createdAt } }),
    markRoomRead(room.id, 'store', ctx.readerId),
  ])

  return NextResponse.json({ message: serializeMessage(created, ctx.viewer, ctx.storeId) })
}
