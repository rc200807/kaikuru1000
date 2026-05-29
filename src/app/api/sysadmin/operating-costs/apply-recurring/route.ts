import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { applyRecurringCosts } from '@/lib/operating-costs'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })

// 定期（毎月固定）コストを指定月に反映
export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '対象月の形式が不正です' }, { status: 400 })

  const { created } = await applyRecurringCosts(parsed.data.month)
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `定期コストを反映 ${parsed.data.month}（${created}件）`, req })
  return NextResponse.json({ created })
}
