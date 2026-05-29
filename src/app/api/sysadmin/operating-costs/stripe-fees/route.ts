import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordStripeFees } from '@/lib/operating-costs'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })

// 指定月の Stripe 決済手数料を自動集計して運用コストに記録
export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '対象月の形式が不正です' }, { status: 400 })

  const { amount } = await recordStripeFees(parsed.data.month)
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `Stripe手数料を自動取得 ${parsed.data.month}（¥${amount.toLocaleString()}）`, req })
  return NextResponse.json({ amount })
}
