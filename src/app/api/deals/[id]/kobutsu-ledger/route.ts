import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchKobutsuLedgerGroup } from '@/lib/kobutsu-ledger-server'
import { contractEntryKey, dealEntryKey } from '@/lib/kobutsu-ledger'

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
  if (!deal.storeId) {
    // 担当店舗が未割当の案件は台帳（営業所単位）に載らない
    return NextResponse.json({ group: null, store: null })
  }

  // 電子の売買契約書があればそれが台帳のキー。無い場合でも、紙で契約した案件
  // （写真をアップロードした案件）は台帳の記載対象なので案件キーで引く。
  const contractId =
    deal.salesContract?.id ??
    deal.visitSchedules.map(v => v.salesContract?.id).find((v): v is string => !!v) ??
    null

  let paperImages: string[] = []
  try { paperImages = JSON.parse(deal.paperContractImages || '[]') } catch { /* ignore */ }
  const hasPaperContract = paperImages.length > 0

  const entryKey = contractId
    ? contractEntryKey(contractId)
    : hasPaperContract ? dealEntryKey(deal.id) : null
  if (!entryKey) return NextResponse.json({ group: null, store: null })

  const group = await fetchKobutsuLedgerGroup(entryKey, deal.storeId)
  return NextResponse.json({
    group,
    entryKey,
    // 紙契約の場合、取引年月日は案件詳細から入力する（未入力なら訪問日・案件発生日で暫定表示）
    paperContract: contractId ? null : {
      agreedAt: deal.paperContractAgreedAt?.toISOString() ?? null,
      imageCount: paperImages.length,
    },
    store: deal.store
      ? { name: deal.store.name, code: deal.store.code, antiquePermitNumber: deal.store.antiquePermitNumber }
      : null,
  })
}
