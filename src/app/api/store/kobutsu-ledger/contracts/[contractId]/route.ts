import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchKobutsuLedgerGroup } from '@/lib/kobutsu-ledger-server'

/**
 * 台帳1項目（案件＝売買契約1件）の詳細。品目ごとの明細を含む。
 * 他店舗の契約は 404（fetchKobutsuLedgerGroup が storeId で絞る）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string

  const { contractId } = await params
  const group = await fetchKobutsuLedgerGroup(contractId, storeId)
  if (!group) {
    return NextResponse.json({ error: '台帳の記録が見つかりません' }, { status: 404 })
  }

  // 帳票の見出し用（営業所名・古物商許可番号）
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { name: true, code: true, antiquePermitNumber: true },
  })

  return NextResponse.json({ group, store })
}
