import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractTextFromPdf } from '@/lib/gemini'

// ナレッジベースの資料（PDF）のAIテキスト抽出を処理（1分ごとに実行、1回1件）。
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
  await prisma.knowledgeDocument.updateMany({
    where: { status: 'processing', updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: 'pending' },
  })

  // 次の1件を取得（古い順）
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  if (!doc) return NextResponse.json({ processed: 0 })

  // 排他的に processing へ（同時実行の二重処理を防ぐ）
  const claim = await prisma.knowledgeDocument.updateMany({
    where: { id: doc.id, status: 'pending' },
    data: { status: 'processing', attempts: { increment: 1 }, errorMessage: null },
  })
  if (claim.count === 0) return NextResponse.json({ processed: 0, note: 'claimed by other' })

  try {
    const res = await fetch(doc.fileUrl)
    if (!res.ok) throw new Error(`資料の取得に失敗 (HTTP ${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const text = await extractTextFromPdf(buffer, doc.mimeType || 'application/pdf', doc.fileName || 'document')

    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: 'ready', extractedText: text, errorMessage: null },
    })
    return NextResponse.json({ processed: 1, id: doc.id, status: 'ready' })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    const attempts = doc.attempts + 1
    const giveUp = attempts >= MAX_ATTEMPTS
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: giveUp ? 'error' : 'pending', errorMessage: msg.slice(0, 1000) },
    })
    console.error('[process-knowledge-documents] failed', doc.id, msg)
    return NextResponse.json({ processed: 1, id: doc.id, status: giveUp ? 'error' : 'retry', error: msg })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
