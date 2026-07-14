import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'

/** 回答への絵文字リアクション（役に立った等）をトグル */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  const emoji = typeof body?.emoji === 'string' ? body.emoji.slice(0, 16) : ''
  if (!emoji) return NextResponse.json({ error: '絵文字が指定されていません' }, { status: 400 })

  const answer = await prisma.answer.findUnique({ where: { id }, select: { id: true } })
  if (!answer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const key = { answerId_storeId_emoji: { answerId: id, storeId: ctx.storeId, emoji } }
  const existing = await prisma.answerReaction.findUnique({ where: key })
  if (existing) {
    await prisma.answerReaction.delete({ where: key })
    return NextResponse.json({ action: 'removed' })
  }
  await prisma.answerReaction.create({ data: { answerId: id, storeId: ctx.storeId, emoji } })
  return NextResponse.json({ action: 'added' })
}
