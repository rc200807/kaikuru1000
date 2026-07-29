import { NextRequest, NextResponse } from 'next/server'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { runSystemFeeBilling } from '@/lib/store-billing'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'
export const maxDuration = 300

// 当月のシステム利用料課金を手動実行（全店舗 or 指定店舗）。冪等（支払済/処理中はスキップ）
export async function POST(request: NextRequest) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const storeId = typeof body.storeId === 'string' ? body.storeId : undefined

  const summary = await runSystemFeeBilling(undefined, storeId)

  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料の課金を手動実行（${summary.month}: 成功${summary.paid}/失敗${summary.failed}/カード未登録${summary.noCard}/スキップ${summary.skipped}）`,
    req: request,
  })
  return NextResponse.json(summary)
}
