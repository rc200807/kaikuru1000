import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { groupReactions } from '@/lib/reactions'

/** 公開済みお知らせ詳細（店舗用）。リアクション・コメント込み。 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string

  const { id } = await params
  const announcement = await prisma.announcement.findFirst({
    where: { id, isPublished: true },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      categoryId: true,
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
      priority: true,
      publishedAt: true,
      admin: { select: { name: true } },
      reactions: { select: { emoji: true, storeId: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorType: true, authorName: true, body: true, createdAt: true, storeId: true },
      },
    },
  })

  if (!announcement) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  const { reactions, comments, ...rest } = announcement
  return NextResponse.json({
    ...rest,
    reactions: groupReactions(reactions, storeId),
    comments: comments.map((c) => ({
      id: c.id,
      authorType: c.authorType,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
      mine: c.authorType === 'store' && c.storeId === storeId,
    })),
  })
}
