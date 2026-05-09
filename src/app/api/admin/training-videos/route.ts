import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 動画一覧（管理者用 - 非公開含む） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
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
    },
  })

  return NextResponse.json(videos)
}

/** 動画作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
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
