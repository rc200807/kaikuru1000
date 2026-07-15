import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済み研修動画一覧（店舗用） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = user.id as string

  // カテゴリごとにグループ化して返す
  const categories = await prisma.videoCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      videos: {
        where: { isPublished: true },
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          title: true,
          description: true,
          videoUrl: true,
          thumbnailUrl: true,
          fileSize: true,
          publishedAt: true,
          views: {
            where: { storeId },
            select: { playCount: true, lastViewedAt: true },
          },
          favorites: {
            where: { storeId },
            select: { id: true },
          },
          _count: { select: { likes: true } },
        },
      },
    },
  })

  // 動画があるカテゴリのみ返し、各動画に viewed / favorited / likeCount フラグを付与
  const result = categories
    .filter(c => c.videos.length > 0)
    .map(c => ({
      id: c.id,
      name: c.name,
      videos: c.videos.map(v => {
        const view = v.views[0]
        const { views, favorites, _count, ...rest } = v
        return {
          ...rest,
          viewed: !!view,
          playCount: view?.playCount ?? 0,
          lastViewedAt: view?.lastViewedAt ?? null,
          favorited: favorites.length > 0,
          likeCount: _count.likes,
        }
      }),
    }))

  return NextResponse.json(result)
}
