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

  const { id } = await params
  const video = await prisma.trainingVideo.findFirst({
    where: { id, isPublished: true },
    select: {
      id: true,
      title: true,
      description: true,
      youtubeUrl: true,
      summary: true,
      summaryAt: true,
      keyPoints: true,
      publishedAt: true,
      category: { select: { id: true, name: true } },
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

  return NextResponse.json({
    ...video,
    keyPoints,
  })
}
