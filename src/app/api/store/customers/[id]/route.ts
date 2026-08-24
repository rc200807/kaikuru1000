import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTimer } from '@/lib/api-timing'

/**
 * 顧客詳細（店舗ポータル）。
 * 詳細画面は以前は一覧API（limit=200）から該当顧客を探していたため、
 * 担当顧客が200件を超えると「顧客が見つかりません」になっていた。単票取得に置き換える。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id as string
  const { id } = await params

  const t = createTimer()
  const customer = await t.measure('customer', () => prisma.user.findFirst({
    // 統合で吸収された顧客は詳細を開かせない（一覧の条件と揃える）
    where: { id, storeId, mergedIntoUserId: null },
    select: {
      id: true, name: true, furigana: true,
      lastName: true, firstName: true, lastNameKana: true, firstNameKana: true,
      email: true, phone: true, phone2: true, phone3: true, postalCode: true, address: true,
      internalNote: true,
      idDocumentPath: true, createdAt: true, lastVisitedAt: true,
      customerType: true,
      birthDate: true, occupation: true, leadSource: true, visitFrequencyMonths: true,
      // 身分証OCR抽出フィールド
      idDocumentType: true, idName: true, idBirthDate: true,
      idAddress: true, idLicenseNumber: true, idExpiryDate: true,
      idOcrIssueReport: true,
      // 振込先口座情報
      bankName: true, branchName: true, accountType: true,
      accountNumber: true, accountHolder: true,
      visitSchedules: {
        where: { visitDate: { gte: new Date() }, status: 'scheduled' },
        orderBy: { visitDate: 'asc' },
        take: 1,
        select: { visitDate: true, status: true },
      },
    },
  }))

  if (!customer) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
  return t.json({ customer })
}
