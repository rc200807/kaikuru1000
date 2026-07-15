import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済み研修動画詳細（店舗用） */
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
  const video = await prisma.trainingVideo.findFirst({
    where: { id, isPublished: true },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      thumbnailUrl: true,
      summary: true,
      summaryAt: true,
      keyPoints: true,
      publishedAt: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      _count: { select: { likes: true } },
      likes: { where: { storeId }, select: { id: true } },
      favorites: { where: { storeId }, select: { id: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorType: true, authorName: true, body: true, createdAt: true, storeId: true },
      },
    },
  })

  if (!video) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
  }

  // keyPointsをJSON解析
  let keyPoints: string[] = []
  if (video.keyPoints) {
    try { keyPoints = JSON.parse(video.keyPoints) } catch { /* ignore */ }
  }

  // 関連動画（同カテゴリを優先し、残りを新着で補完。自分自身は除外）
  const relatedRaw = await prisma.trainingVideo.findMany({
    where: { isPublished: true, id: { not: id } },
    orderBy: [
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
    take: 40,
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      categoryId: true,
      category: { select: { name: true } },
      views: { where: { storeId }, select: { id: true } },
    },
  })
  const related = relatedRaw
    .map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      categoryName: v.category.name,
      viewed: v.views.length > 0,
      sameCategory: v.categoryId === video.categoryId,
    }))
    // 同カテゴリを先頭に並べる
    .sort((a, b) => Number(b.sameCategory) - Number(a.sameCategory))
    .slice(0, 12)

  const { keyPoints: _kp, categoryId: _cid, _count, likes, favorites, comments, ...rest } = video
  return NextResponse.json({
    ...rest,
    keyPoints,
    likeCount: _count.likes,
    liked: likes.length > 0,
    favorited: favorites.length > 0,
    comments: comments.map(c => ({
      id: c.id,
      authorType: c.authorType,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
      mine: c.authorType === 'store' && c.storeId === storeId,
    })),
    related,
  })
}
