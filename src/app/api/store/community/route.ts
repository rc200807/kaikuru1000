import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** コミュニティスレッド一覧（店舗用） */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { content: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const threads = await prisma.communityThread.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    include: {
      store: { select: { id: true, name: true, avatar: true } },
      _count: { select: { replies: true } },
      reactions: {
        select: { emoji: true, storeId: true },
      },
    },
  })

  // Group reactions by emoji with count and whether current user reacted
  const storeId = user.storeId || user.id
  const result = threads.map((t) => {
    let imageUrls: string[] = []
    try { imageUrls = JSON.parse(t.imageUrls || '[]') } catch { /* ignore */ }
    return {
      id: t.id,
      title: t.title,
      content: t.content,
      imageUrls,
      isPinned: t.isPinned,
      store: t.store,
      replyCount: t._count.replies,
      reactions: groupReactions(t.reactions, storeId),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }
  })

  return NextResponse.json(result)
}

/** スレッド作成 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { title, content, imageUrls } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 })
  }

  // imageUrlsのバリデーション（最大3枚）
  let validImageUrls: string[] = []
  if (Array.isArray(imageUrls)) {
    validImageUrls = imageUrls.filter((u: any) => typeof u === 'string' && u.startsWith('http')).slice(0, 3)
  }

  const storeId = user.storeId || user.id

  const thread = await prisma.communityThread.create({
    data: {
      title: title.trim(),
      content: content.trim(),
      imageUrls: JSON.stringify(validImageUrls),
      storeId,
    },
    include: {
      store: { select: { id: true, name: true, avatar: true } },
    },
  })

  return NextResponse.json(thread, { status: 201 })
}

function groupReactions(
  reactions: { emoji: string; storeId: string }[],
  currentStoreId: string
) {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const existing = map.get(r.emoji) || { count: 0, reacted: false }
    existing.count++
    if (r.storeId === currentStoreId) existing.reacted = true
    map.set(r.emoji, existing)
  }
  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    reacted: data.reacted,
  }))
}
