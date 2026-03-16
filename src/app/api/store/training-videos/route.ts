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

  // カテゴリごとにグループ化して返す
  const categories = await prisma.videoCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      videos: {
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          youtubeUrl: true,
          publishedAt: true,
        },
      },
    },
  })

  // 動画があるカテゴリのみ返す
  const result = categories
    .filter(c => c.videos.length > 0)
    .map(c => ({
      id: c.id,
      name: c.name,
      videos: c.videos,
    }))

  return NextResponse.json(result)
}
