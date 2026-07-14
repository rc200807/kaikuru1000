import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminContext, getOrCreateRoom } from '@/lib/chat'

/** 絵文字リアクションのトグル（付与⇄解除） */
export async function POST(request: NextRequest, context: { params: Promise<{ storeId: string; id: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId, id } = await context.params

  const body = await request.json().catch(() => null)
  const emoji = typeof body?.emoji === 'string' ? body.emoji.slice(0, 16) : ''
  if (!emoji) return NextResponse.json({ error: '絵文字が指定されていません' }, { status: 400 })

  const room = await getOrCreateRoom(storeId)
  const message = await prisma.chatMessage.findFirst({ where: { id, roomId: room.id } })
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const key = {
    messageId_actorType_actorId_emoji: {
      messageId: id,
      actorType: 'admin',
      actorId: ctx.adminId,
      emoji,
    },
  }
  const existing = await prisma.chatReaction.findUnique({ where: key })
  if (existing) {
    await prisma.chatReaction.delete({ where: key })
    return NextResponse.json({ action: 'removed' })
  }
  await prisma.chatReaction.create({
    data: { messageId: id, emoji, actorType: 'admin', actorId: ctx.adminId, actorName: ctx.authorName },
  })
  return NextResponse.json({ action: 'added' })
}
