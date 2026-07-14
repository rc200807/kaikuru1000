import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext, getOrCreateRoom } from '@/lib/chat'

/** 自店舗ルーム内で、指定メッセージが自分の発言か検証して返す */
async function findOwnMessage(storeId: string, memberId: string | null, messageId: string) {
  const room = await getOrCreateRoom(storeId)
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, roomId: room.id } })
  if (!message || message.authorType !== 'store') return { error: 'Not found' as const, status: 404 }
  // メンバーログイン時は本人のメッセージのみ。店舗直ログイン時は店舗の全メッセージを許可。
  if (memberId && message.authorMemberId !== memberId) {
    return { error: 'Forbidden' as const, status: 403 }
  }
  return { message }
}

/** 自分のメッセージを編集 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const found = await findOwnMessage(ctx.storeId, ctx.memberId, id)
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status })
  if (found.message.deletedAt) return NextResponse.json({ error: '削除済みのメッセージです' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: '本文を入力してください' }, { status: 400 })

  await prisma.chatMessage.update({ where: { id }, data: { body: text, editedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

/** 自分のメッセージをソフト削除 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const found = await findOwnMessage(ctx.storeId, ctx.memberId, id)
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status })

  await prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
