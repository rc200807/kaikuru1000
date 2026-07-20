import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { transcribeAndSummarizeAudio } from '@/lib/gemini'

// 会話録音のAI文字起こし＋要約を処理（1分ごとに実行、1回1件）。
// 音声解析は時間がかかるため maxDuration いっぱいまで使い、1件ずつ確実に処理する。
export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_ATTEMPTS = 3
const STALE_MS = 10 * 60 * 1000 // 10分以上 processing のままなら再投入

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // スタックした processing を pending へ戻す（前回タイムアウト等）
  await prisma.dealRecording.updateMany({
    where: { status: 'processing', updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: 'pending' },
  })

  // 次の1件を取得（古い順）
  const rec = await prisma.dealRecording.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  if (!rec) return NextResponse.json({ processed: 0 })

  // 排他的に processing へ（同時実行の二重処理を防ぐ）
  const claim = await prisma.dealRecording.updateMany({
    where: { id: rec.id, status: 'pending' },
    data: { status: 'processing', attempts: { increment: 1 }, error: null },
  })
  if (claim.count === 0) return NextResponse.json({ processed: 0, note: 'claimed by other' })

  try {
    const res = await fetch(rec.audioUrl)
    if (!res.ok) throw new Error(`音声取得に失敗 (HTTP ${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const analysis = await transcribeAndSummarizeAudio(buffer, rec.mimeType || 'audio/mpeg', rec.fileName || 'recording')

    await prisma.dealRecording.update({
      where: { id: rec.id },
      data: {
        status: 'done',
        transcript: analysis.transcript,
        summary: JSON.stringify(analysis.summary),
        error: null,
        processedAt: new Date(),
      },
    })
    return NextResponse.json({ processed: 1, id: rec.id, status: 'done' })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    const attempts = rec.attempts + 1
    const giveUp = attempts >= MAX_ATTEMPTS
    await prisma.dealRecording.update({
      where: { id: rec.id },
      data: { status: giveUp ? 'error' : 'pending', error: msg.slice(0, 1000) },
    })
    console.error('[process-transcriptions] failed', rec.id, msg)
    return NextResponse.json({ processed: 1, id: rec.id, status: giveUp ? 'error' : 'retry', error: msg })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
