import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildStoreCustomersWhere, parseCustomerSort } from '@/lib/customer-list-query'
import { customersToCsv, csvFileName, CSV_EXPORT_LIMIT } from '@/lib/customer-csv'

// 担当顧客CSVエクスポート（店舗）
// フィルタ条件は一覧APIと同じクエリパラメータ。ids指定時は選択された顧客のみ出力。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  // 店舗アカウントは自分の担当顧客のみ。管理者も可
  const isAdmin = ['admin','superadmin','hr'].includes(sessionUser.role)
  if (!isAdmin && !(sessionUser.role === 'store' && sessionUser.id === id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)

  const where = ids.length > 0
    ? { id: { in: ids }, storeId: id, mergedIntoUserId: null }
    : buildStoreCustomersWhere(id, searchParams)

  const customers = await prisma.user.findMany({
    where,
    select: {
      name: true, furigana: true, email: true, phone: true, address: true,
      customerType: true, customerTypes: true, visitFrequencyMonths: true,
      leadSource: true, createdAt: true,
    },
    orderBy: parseCustomerSort(searchParams, { name: 'asc' }),
    take: CSV_EXPORT_LIMIT,
  })

  // 個人情報を含む出力のため監査用にログを残す
  console.log(`[CustomerExport] store=${id} by=${sessionUser.id} rows=${customers.length} ids=${ids.length > 0}`)

  const csv = customersToCsv(customers, { includeStore: false })
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName('customers')}"`,
    },
  })
}
