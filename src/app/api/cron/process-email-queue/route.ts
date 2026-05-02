import { NextRequest, NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/email-queue'

/**
 * POST /api/cron/process-email-queue
 *
 * メール送信キューの処理（2分ごとに実行）
 * - pending または 失敗だがリトライ可能なジョブを最大20件処理
 * - 失敗時は最大3回までリトライ（5分間隔）
 */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processEmailQueue(20)
  console.log('[process-email-queue]', result)

  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return POST(request)
}
