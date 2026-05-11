import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 視聴記録 — 店舗が動画を再生した時に呼ぶ。playCount を +1、lastViewedAt を now にする */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 公開済みかどうかを確認
  const video = await prisma.trainingVideo.findFirst({
    where: { id, isPublished: true },
    select: { id: true },
  })
  if (!video) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
  }

  const now = new Date()
  const view = await prisma.trainingVideoView.upsert({
    where: {
      trainingVideoId_storeId: { trainingVideoId: id, storeId: user.id },
    },
    create: {
      trainingVideoId: id,
      storeId: user.id,
      playCount: 1,
      firstViewedAt: now,
      lastViewedAt: now,
    },
    update: {
      playCount: { increment: 1 },
      lastViewedAt: now,
    },
    select: { playCount: true, firstViewedAt: true, lastViewedAt: true },
  })

  return NextResponse.json(view)
}
