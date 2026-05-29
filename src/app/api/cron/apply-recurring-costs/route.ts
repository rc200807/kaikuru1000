import { NextRequest, NextResponse } from 'next/server'
import { applyRecurringCosts, recordStripeFees, currentMonthKey, previousMonthKey } from '@/lib/operating-costs'

export const runtime = 'nodejs'

/**
 * 毎月1日に実行（Vercel Cron）。
 * - 当月の運用コストへ定期（固定費）を反映
 * - 前月の Stripe 手数料を確定値として自動記録
 */
async function run() {
  const current = currentMonthKey()
  const previous = previousMonthKey()
  const recurring = await applyRecurringCosts(current)
  let stripeAmount = 0
  try {
    stripeAmount = (await recordStripeFees(previous)).amount
  } catch (e) {
    console.error('[cron/apply-recurring-costs] stripe fees failed', e)
  }
  return { current, previous, recurringCreated: recurring.created, stripeFee: stripeAmount }
}

function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // 未設定環境では通す（既存cronと同方針）
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await run()) })
}

// Vercel Cron は GET で叩く
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await run()) })
}
