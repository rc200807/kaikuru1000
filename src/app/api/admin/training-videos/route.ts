import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 動画一覧（管理者用 - 非公開含む） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const videos = await prisma.trainingVideo.findMany({
    orderBy: [
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
    include: {
      category: { select: { id: true, name: true } },
      admin: { select: { name: true } },
      _count: { select: { views: true } },
    },
  })

  // 全店舗数を取得（視聴率の分母として）
  const totalActiveStores = await prisma.store.count({ where: { isActive: true } })

  // 各動画の合計再生回数を集計
  const playSums = await prisma.trainingVideoView.groupBy({
    by: ['trainingVideoId'],
    _sum: { playCount: true },
    where: { trainingVideoId: { in: videos.map(v => v.id) } },
  })
  const totalPlayMap = new Map(playSums.map(p => [p.trainingVideoId, p._sum.playCount ?? 0]))

  const result = videos.map(v => ({
    ...v,
    viewedStoreCount: v._count.views,
    totalActiveStores,
    totalPlays: totalPlayMap.get(v.id) ?? 0,
  }))

  return NextResponse.json(result)
}

/** 動画作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, videoUrl, thumbnailUrl, fileSize, categoryId, isPublished, publishedAt } = body

  if (!title?.trim() || !videoUrl?.trim() || !categoryId) {
    return NextResponse.json({ error: 'タイトル、動画ファイル、カテゴリは必須です' }, { status: 400 })
  }

  // 公開日: 明示指定があればそれを使用、なければ公開時のみ now() をセット
  let publishedAtValue: Date | null = null
  if (publishedAt) {
    const d = new Date(publishedAt)
    if (!isNaN(d.getTime())) publishedAtValue = d
  } else if (isPublished) {
    publishedAtValue = new Date()
  }

  const video = await prisma.trainingVideo.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      videoUrl: videoUrl.trim(),
      thumbnailUrl: thumbnailUrl?.trim() || null,
      fileSize: fileSize || null,
      categoryId,
      isPublished: !!isPublished,
      publishedAt: publishedAtValue,
      adminId: user.id,
    },
    include: {
      category: { select: { id: true, name: true } },
      admin: { select: { name: true } },
    },
  })

  return NextResponse.json(video, { status: 201 })
}
