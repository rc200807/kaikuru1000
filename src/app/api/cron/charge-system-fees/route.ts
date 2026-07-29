import { NextRequest, NextResponse } from 'next/server'
import { runSystemFeeBilling } from '@/lib/store-billing'

export const runtime = 'nodejs'
// 店舗数×Stripe課金の直列実行のため上限まで確保
export const maxDuration = 300

/**
 * 毎月1日に実行（Vercel Cron）。アクティブな全店舗へ当月のシステム利用料を課金する。
 * 冪等（StorePayment の unique 制約 + Stripe idempotencyKey）なので再実行しても二重課金しない。
 */
function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // 未設定環境では通す（既存cronと同方針）
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const summary = await runSystemFeeBilling()
  console.log('[cron/charge-system-fees]', JSON.stringify(summary))
  return NextResponse.json({ ok: true, ...summary })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
