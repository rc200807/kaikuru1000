import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { summarizeVideo, GeminiError } from '@/lib/gemini'

/** 動画のAI要約を生成 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const video = await prisma.trainingVideo.findUnique({ where: { id } })
  if (!video) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
  }

  let result
  try {
    result = await summarizeVideo(video.videoUrl, video.title, video.description)
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = err.reason === 'no-key' ? 503 : 502
      const message = err.reason === 'no-key'
        ? 'AI要約を実行できません。GEMINI_API_KEY が設定されているか確認してください。'
        : `AI要約に失敗しました: ${err.detail ?? err.message}`
      return NextResponse.json({ error: message, reason: err.reason }, { status })
    }
    throw err
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
