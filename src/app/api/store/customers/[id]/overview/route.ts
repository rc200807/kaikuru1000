import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildStoreCustomerOverview } from '@/lib/store-customer-overview'
import { createTimer } from '@/lib/api-timing'

/**
 * 顧客詳細1画面ぶんのデータをまとめて返す（店舗ポータル）。
 * 従来は顧客・案件・訪問予定・書類・買取希望品・問い合わせ・宅配・日程提案で
 * 7〜8本のAPIを叩いていた。往復1本あたり0.3秒前後かかるため1本に集約する。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as { id?: string; role?: string } | undefined
  if (!session || sessionUser?.role !== 'store' || !sessionUser.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const t = createTimer()
  const data = await t.measure('overview', () => buildStoreCustomerOverview(sessionUser.id as string, id))
  if (!data) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  return t.json(data)
}
