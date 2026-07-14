import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'

/** 質問に回答を投稿 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: '回答を入力してください' }, { status: 400 })

  const question = await prisma.question.findUnique({ where: { id }, select: { id: true } })
  if (!question) return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 })

  await prisma.answer.create({
    data: {
      questionId: id,
      body: text.slice(0, 5000),
      storeId: ctx.storeId,
      memberId: ctx.memberId,
      authorName: ctx.authorName,
    },
  })
  await prisma.question.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json({ ok: true }, { status: 201 })
}
