import { NextRequest, NextResponse } from 'next/server'
import { processLineQueue } from '@/lib/line-scenario'

/**
 * POST /api/cron/process-line-queue
 *
 * LINE 自動配信キューの処理（2分ごとに実行）
 * - pending または 失敗だがリトライ可能なジョブを最大20件処理
 * - 失敗時は最大3回までリトライ（5分間隔）
 * - ブロック済みユーザー宛はキャンセル
 */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processLineQueue(20)
  console.log('[process-line-queue]', result)

  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return POST(request)
}
