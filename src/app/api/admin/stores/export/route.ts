import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildCsv } from '@/lib/csv-parser'
import { storeStatusLabel } from '@/lib/store-status'
import { parseServiceAreas } from '@/lib/address-utils'

/**
 * 店舗情報の全項目CSVダウンロード（管理者向け）。
 * 表示列連動のクライアント側エクスポートとは別に、全店舗・全項目を出力する。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stores = await prisma.store.findMany({
    orderBy: { code: 'asc' },
    select: {
      code: true, name: true, storeStatus: true, isActive: true,
      postalCode: true, prefecture: true, address: true, phone: true, email: true,
      contractNotifyEmail: true, calendarInviteEmail: true,
      openingDate: true, closingDate: true,
      googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true,
      bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
      invoiceNumber: true, antiquePermitNumber: true, serviceAreas: true,
      createdAt: true,
      operator: { select: { name: true } },
      _count: { select: { customers: true } },
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const day = (d: Date | null) => (d ? new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')
  const areas = (json: string | null) =>
    parseServiceAreas(json).map(a => (a.cities.length > 0 ? `${a.prefecture}(${a.cities.length})` : a.prefecture)).join('; ')

  const headers = [
    '店舗コード', '店舗名', 'ステータス', '有効', '運営者', '郵便番号', '都道府県', '住所',
    '電話番号', 'メール', '契約通知メール', 'カレンダー招待メール', '開業日', '閉店日',
    'GoogleビジネスURL', 'おいくらURL', 'LINE友達登録URL',
    '銀行名', '支店名', '口座種別', '口座番号', '口座名義', 'インボイス番号', '古物許可番号',
    '対応エリア', '顧客数', '登録日', '問い合わせフォームURL',
  ]

  const rows = stores.map(s => [
    s.code, s.name, storeStatusLabel(s.storeStatus), s.isActive ? '有効' : '無効',
    s.operator?.name ?? '', s.postalCode ?? '', s.prefecture ?? '', s.address ?? '',
    s.phone ?? '', s.email ?? '', s.contractNotifyEmail ?? '', s.calendarInviteEmail ?? '',
    day(s.openingDate), day(s.closingDate),
    s.googleBusinessUrl ?? '', s.oikuraPageUrl ?? '', s.lineAddFriendUrl ?? '',
    s.bankName ?? '', s.branchName ?? '', s.accountType ?? '', s.accountNumber ?? '', s.accountHolder ?? '',
    s.invoiceNumber ?? '', s.antiquePermitNumber ?? '', areas(s.serviceAreas),
    String(s._count.customers), day(s.createdAt),
    `${baseUrl}/inquiry/${s.code}`,
  ])

  const csv = buildCsv([headers, ...rows])
  const filename = `stores-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
