import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminUsersWhere, parseCustomerSort } from '@/lib/customer-list-query'
import { customersToCsv, csvFileName, CSV_EXPORT_LIMIT } from '@/lib/customer-csv'

// 顧客一覧CSVエクスポート（管理者）
// フィルタ条件は一覧APIと同じクエリパラメータ。ids指定時は選択された顧客のみ出力。
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)

  const where = ids.length > 0
    ? { id: { in: ids }, mergedIntoUserId: null }
    : buildAdminUsersWhere(searchParams)

  const users = await prisma.user.findMany({
    where,
    select: {
      name: true, furigana: true, email: true, phone: true, address: true,
      customerType: true, customerTypes: true, visitFrequencyMonths: true,
      leadSource: true, createdAt: true,
      store: { select: { name: true } },
    },
    orderBy: parseCustomerSort(searchParams, { createdAt: 'desc' }),
    take: CSV_EXPORT_LIMIT,
  })

  // 個人情報を含む出力のため監査用にログを残す
  console.log(`[CustomerExport] admin=${sessionUser.id} rows=${users.length} ids=${ids.length > 0}`)

  const csv = customersToCsv(users, { includeStore: true })
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName('customers')}"`,
    },
  })
}
