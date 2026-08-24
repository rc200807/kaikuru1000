import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchKobutsuLedgerGroup } from '@/lib/kobutsu-ledger-server'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 案件に紐づく古物台帳（案件詳細のセクション用）。
 * 台帳は営業所単位のデータなので、案件の担当店舗を基準に取得する。
 * 権限は案件詳細と同じ（店舗は自店舗のみ／管理者は全件）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  const isStore = sessionUser?.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser?.role)
  if (!session || (!isStore && !isAdmin)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true, storeId: true,
      salesContract: { select: { id: true } },
      // 案件に契約が直付けされていない旧データは訪問側の契約を見る
      visitSchedules: { select: { salesContract: { select: { id: true } } } },
      store: { select: { name: true, code: true, antiquePermitNumber: true } },
    },
  })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!deal.storeId) {
    // 担当店舗が未割当の案件は台帳（営業所単位）に載らない
    return NextResponse.json({ group: null, store: null })
  }

  const contractId =
    deal.salesContract?.id ??
    deal.visitSchedules.map(v => v.salesContract?.id).find((v): v is string => !!v) ??
    null
  if (!contractId) return NextResponse.json({ group: null, store: null })

  const group = await fetchKobutsuLedgerGroup(contractId, deal.storeId)
  return NextResponse.json({
    group,
    store: deal.store
      ? { name: deal.store.name, code: deal.store.code, antiquePermitNumber: deal.store.antiquePermitNumber }
      : null,
  })
}
