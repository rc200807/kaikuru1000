import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildStoreDashboard } from '@/lib/store-dashboard-data'

// 店舗ダッシュボード（集計ロジックは src/lib/store-dashboard-data.ts に共通化。
// 管理ポータルの店舗別ダッシュボード /api/admin/stores/[id]/dashboard と共用）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const data = await buildStoreDashboard(storeId)
  return NextResponse.json(data)
}
