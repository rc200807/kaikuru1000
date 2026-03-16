import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { summarizeVideo } from '@/lib/gemini'

/** 動画のAI要約を生成 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const video = await prisma.trainingVideo.findUnique({ where: { id } })
  if (!video) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
  }

  const result = await summarizeVideo(video.youtubeUrl, video.title, video.description)
  if (!result) {
    return NextResponse.json({ error: 'AI要約の生成に失敗しました' }, { status: 500 })
  }

  const updated = await prisma.trainingVideo.update({
    where: { id },
    data: {
      summary: result.summary,
      keyPoints: JSON.stringify(result.keyPoints),
      summaryAt: new Date(),
    },
  })

  return NextResponse.json({
    summary: updated.summary,
    keyPoints: result.keyPoints,
    summaryAt: updated.summaryAt,
  })
}
