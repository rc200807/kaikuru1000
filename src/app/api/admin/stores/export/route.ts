import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildCsv } from '@/lib/csv-parser'
import { storeStatusLabel } from '@/lib/store-status'
import { storeServicesLabel } from '@/lib/store-services'
import { STORE_CSV_COLUMNS } from '@/lib/store-csv'

/**
 * 店舗情報の全項目CSVダウンロード（管理者向け）。
 * 店舗コードをキーにした往復可能フォーマット（このCSVをそのままインポートで取り込める）。
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
      supportedServices: true,
      createdAt: true,
      operator: { select: { name: true } },
      _count: { select: { customers: true } },
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const day = (d: Date | null) => (d ? new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')
  // 日付は往復用に YYYY-MM-DD で出力（インポート時に new Date で解釈可能）
  const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')

  const cell = (s: (typeof stores)[number], key: string): string => {
    switch (key) {
      case 'storeStatus':  return storeStatusLabel(s.storeStatus)
      case 'openingDate':  return ymd(s.openingDate)
      case 'closingDate':  return ymd(s.closingDate)
      case 'serviceAreas': return s.serviceAreas ?? ''
      case 'supportedServices': return storeServicesLabel(s.supportedServices)
      case 'operatorName': return s.operator?.name ?? ''
      case 'isActive':     return s.isActive ? '有効' : '無効'
      case 'customerCount': return String(s._count.customers)
      case 'createdAt':    return day(s.createdAt)
      case 'inquiryUrl':   return `${baseUrl}/inquiry/${s.code}`
      case 'telUrl':       return `${baseUrl}/tel/${s.code}`
      case 'lineUrl':      return `${baseUrl}/line/${s.code}`
      default:             return (s as Record<string, unknown>)[key] != null ? String((s as Record<string, unknown>)[key]) : ''
    }
  }

  const headers = STORE_CSV_COLUMNS.map(c => c.header)
  const rows = stores.map(s => STORE_CSV_COLUMNS.map(c => cell(s, c.key)))

  const csv = buildCsv([headers, ...rows])
  const filename = `stores-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
