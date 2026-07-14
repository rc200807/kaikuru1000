import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminContext, getOrCreateRoom } from '@/lib/chat'

/** 自分の発言か検証して返す */
async function findOwnMessage(storeId: string, adminId: string, messageId: string) {
  const room = await getOrCreateRoom(storeId)
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, roomId: room.id } })
  if (!message || message.authorType !== 'admin') return { error: 'Not found' as const, status: 404 }
  if (message.authorAdminId !== adminId) return { error: 'Forbidden' as const, status: 403 }
  return { message }
}

/** 自分のメッセージを編集 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ storeId: string; id: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId, id } = await context.params

  const found = await findOwnMessage(storeId, ctx.adminId, id)
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status })
  if (found.message.deletedAt) return NextResponse.json({ error: '削除済みのメッセージです' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: '本文を入力してください' }, { status: 400 })

  await prisma.chatMessage.update({ where: { id }, data: { body: text, editedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

/** 自分のメッセージをソフト削除 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ storeId: string; id: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId, id } = await context.params

  const found = await findOwnMessage(storeId, ctx.adminId, id)
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status })

  await prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
