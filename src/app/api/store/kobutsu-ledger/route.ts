import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchKobutsuLedgerRows } from '@/lib/kobutsu-ledger-server'
import { groupLedgerRows, jstDayBoundary } from '@/lib/kobutsu-ledger'

/**
 * 古物台帳の一覧（店舗ポータル）。
 * 売買契約書が発行された案件を1項目として返す（明細は詳細画面で取得）。
 * 台帳は営業所（店舗）単位で備えるものなので、常にログイン中の店舗のみを対象にする。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const { rows, truncated } = await fetchKobutsuLedgerRows({
    storeId: user.id as string,
    from: jstDayBoundary(sp.get('from'), 'start'),
    to: jstDayBoundary(sp.get('to'), 'end'),
    q: sp.get('q'),
    limit: Math.min(2000, Math.max(1, parseInt(sp.get('limit') || '500', 10) || 500)),
  })

  // 一覧は案件（=売買契約）単位で1項目。明細は詳細画面（contracts/[contractId]）で見る
  const groups = groupLedgerRows(rows)

  return NextResponse.json({
    groups,
    truncated,
    summary: {
      // 台帳の項目数（案件単位）
      count: groups.length,
      itemCount: rows.length,
      quantity: rows.reduce((s, r) => s + r.quantity, 0),
      total: rows.reduce((s, r) => s + r.price, 0),
      incomplete: groups.filter(g => g.missing.length > 0).length,
    },
  })
}
