import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'

/** 質問への絵文字リアクションをトグル */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  const emoji = typeof body?.emoji === 'string' ? body.emoji.slice(0, 16) : ''
  if (!emoji) return NextResponse.json({ error: '絵文字が指定されていません' }, { status: 400 })

  const question = await prisma.question.findUnique({ where: { id }, select: { id: true } })
  if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const key = { questionId_storeId_emoji: { questionId: id, storeId: ctx.storeId, emoji } }
  const existing = await prisma.questionReaction.findUnique({ where: key })
  if (existing) {
    await prisma.questionReaction.delete({ where: key })
    return NextResponse.json({ action: 'removed' })
  }
  await prisma.questionReaction.create({ data: { questionId: id, storeId: ctx.storeId, emoji } })
  return NextResponse.json({ action: 'added' })
}
