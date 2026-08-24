import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchKobutsuLedgerRows } from '@/lib/kobutsu-ledger-server'
import { jstDayBoundary } from '@/lib/kobutsu-ledger'

/**
 * 古物台帳（店舗ポータル）。
 * 売買契約書が発行された案件の買取品目を、古物営業法16条の記載事項に沿った行として返す。
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

  return NextResponse.json({
    rows,
    truncated,
    summary: {
      count: rows.length,
      quantity: rows.reduce((s, r) => s + r.quantity, 0),
      total: rows.reduce((s, r) => s + r.price, 0),
      incomplete: rows.filter(r => r.missing.length > 0).length,
    },
  })
}
