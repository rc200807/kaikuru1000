import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'
import { CATEGORY_KEYS } from '@/lib/chiebukuro'

/** 質問一覧（カテゴリ絞り込み対応） */
export async function GET(request: NextRequest) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const category = request.nextUrl.searchParams.get('category')?.trim() || ''
  const search = request.nextUrl.searchParams.get('search')?.trim() || ''

  // mode:'insensitive' は本番 PostgreSQL 用（ローカル SQLite 型には無いため any で吸収）
  const searchFilter = search
    ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { body: { contains: search, mode: 'insensitive' } }] }
    : {}

  const questions = await prisma.question.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(searchFilter as Record<string, unknown>),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, body: true, category: true, authorName: true, isResolved: true, createdAt: true,
      _count: { select: { answers: true, reactions: true } },
    },
    take: 200,
  })

  return NextResponse.json({
    questions: questions.map(q => ({
      id: q.id,
      title: q.title,
      excerpt: q.body.replace(/\s+/g, ' ').slice(0, 120),
      category: q.category,
      authorName: q.authorName,
      isResolved: q.isResolved,
      answerCount: q._count.answers,
      reactionCount: q._count.reactions,
      createdAt: q.createdAt,
    })),
  })
}

/** 質問を投稿 */
export async function POST(request: NextRequest) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  const category = typeof body?.category === 'string' ? body.category : ''

  if (!title) return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 })
  if (!text) return NextResponse.json({ error: '質問内容を入力してください' }, { status: 400 })
  if (!CATEGORY_KEYS.includes(category)) return NextResponse.json({ error: 'カテゴリを選択してください' }, { status: 400 })

  const created = await prisma.question.create({
    data: {
      title: title.slice(0, 200),
      body: text.slice(0, 5000),
      category,
      storeId: ctx.storeId,
      memberId: ctx.memberId,
      authorName: ctx.authorName,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: created.id }, { status: 201 })
}
