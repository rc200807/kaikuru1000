import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'
import { groupReactions } from '@/lib/reactions'

/** 質問詳細（回答・リアクション込み） */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const q = await prisma.question.findUnique({
    where: { id },
    select: {
      id: true, title: true, body: true, category: true, authorName: true, storeId: true, isResolved: true, createdAt: true,
      reactions: { select: { emoji: true, storeId: true } },
      answers: {
        select: {
          id: true, body: true, authorName: true, storeId: true, isBest: true, createdAt: true,
          reactions: { select: { emoji: true, storeId: true } },
        },
      },
    },
  })
  if (!q) return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 })

  const answers = q.answers
    .map(a => ({
      id: a.id,
      body: a.body,
      authorName: a.authorName,
      isBest: a.isBest,
      mine: a.storeId === ctx.storeId,
      createdAt: a.createdAt,
      reactions: groupReactions(a.reactions, ctx.storeId),
      helpfulCount: a.reactions.length,
    }))
    .sort((x, y) => (Number(y.isBest) - Number(x.isBest)) || (y.helpfulCount - x.helpfulCount) || (new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime()))

  return NextResponse.json({
    id: q.id,
    title: q.title,
    body: q.body,
    category: q.category,
    authorName: q.authorName,
    isResolved: q.isResolved,
    isOwner: q.storeId === ctx.storeId,
    createdAt: q.createdAt,
    reactions: groupReactions(q.reactions, ctx.storeId),
    answers,
  })
}
