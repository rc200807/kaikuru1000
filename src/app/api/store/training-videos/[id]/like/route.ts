import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 研修動画への「いいね（Good）」をトグル（店舗単位） */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string
  const { id } = await params

  const video = await prisma.trainingVideo.findFirst({ where: { id, isPublished: true }, select: { id: true } })
  if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })

  const key = { trainingVideoId_storeId: { trainingVideoId: id, storeId } }
  const existing = await prisma.trainingVideoLike.findUnique({ where: key })
  if (existing) {
    await prisma.trainingVideoLike.delete({ where: key })
  } else {
    await prisma.trainingVideoLike.create({ data: { trainingVideoId: id, storeId } })
  }

  const likeCount = await prisma.trainingVideoLike.count({ where: { trainingVideoId: id } })
  return NextResponse.json({ liked: !existing, likeCount })
}
