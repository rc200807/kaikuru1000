import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildDealLedgerSection } from '@/lib/kobutsu-ledger-server'

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
      paperContractImages: true, paperContractAgreedAt: true,
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
  // 組み立ては src/lib/kobutsu-ledger-server.ts に集約している
  // （案件詳細GET が同じ関数を使って自分のレスポンスに畳み込むため）
  return NextResponse.json(await buildDealLedgerSection({
    id: deal.id,
    storeId: deal.storeId,
    paperContractImages: deal.paperContractImages,
    paperContractAgreedAt: deal.paperContractAgreedAt,
    contractId: deal.salesContract?.id ?? null,
    visitContractIds: deal.visitSchedules.map(v => v.salesContract?.id),
    store: deal.store,
  }))
}
