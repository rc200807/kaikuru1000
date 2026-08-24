import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildStoreDashboard } from '@/lib/store-dashboard-data'
import { resolveStoreScope } from '@/lib/store-scope'
import { createTimer } from '@/lib/api-timing'

// 店舗ダッシュボード（集計ロジックは src/lib/store-dashboard-data.ts に共通化。
// 管理ポータルの店舗別ダッシュボード /api/admin/stores/[id]/dashboard と共用）
// ?storeIds=a,b,c で運営者配下の複数店舗を合算表示（同一運営者所属をサーバ側で検証）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const t = createTimer()
  const scope = await t.measure('scope', () => resolveStoreScope(storeId, request.nextUrl.searchParams.get('storeIds')))
  const data = await t.measure('aggregate', () => buildStoreDashboard(scope.isMulti ? scope.storeIds : storeId))
  return t.json(data)
}
