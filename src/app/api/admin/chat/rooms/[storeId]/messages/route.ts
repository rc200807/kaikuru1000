import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getAdminContext,
  getOrCreateRoom,
  getSerializedThread,
  getOtherPartyReadAt,
  markRoomRead,
  messageInclude,
  serializeMessage,
  parseAttachments,
  type ChatAttachment,
} from '@/lib/chat'

/** 指定店舗ルームのメッセージ一覧 */
export async function GET(_request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId } = await context.params

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const room = await getOrCreateRoom(storeId)
  const [messages, otherReadAt] = await Promise.all([
    getSerializedThread(room.id, storeId, ctx.viewer),
    getOtherPartyReadAt(room.id, 'admin'),
  ])
  return NextResponse.json({ messages, otherReadAt, storeName: store.name })
}

/** メッセージ送信（本部→店舗） */
export async function POST(request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId } = await context.params

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  const attachments: ChatAttachment[] = parseAttachments(
    Array.isArray(body?.attachments) ? JSON.stringify(body.attachments) : undefined,
  )
  const parentId = typeof body?.parentId === 'string' ? body.parentId : null

  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: 'メッセージまたは添付を入力してください' }, { status: 400 })
  }

  const room = await getOrCreateRoom(storeId)

  if (parentId) {
    const parent = await prisma.chatMessage.findFirst({ where: { id: parentId, roomId: room.id } })
    if (!parent) return NextResponse.json({ error: '親メッセージが見つかりません' }, { status: 404 })
  }

  const created = await prisma.chatMessage.create({
    data: {
      roomId: room.id,
      parentId,
      authorType: 'admin',
      authorAdminId: ctx.adminId,
      authorName: ctx.authorName,
      body: text,
      attachments: JSON.stringify(attachments),
    },
    include: messageInclude,
  })

  await Promise.all([
    prisma.chatRoom.update({ where: { id: room.id }, data: { lastMessageAt: created.createdAt } }),
    markRoomRead(room.id, 'admin', ctx.readerId),
  ])

  return NextResponse.json({ message: serializeMessage(created, ctx.viewer, storeId) })
}
