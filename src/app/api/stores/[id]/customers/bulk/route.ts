import { NextRequest, NextResponse, after } from 'next/server'
import { autoSyncCustomerRows } from '@/lib/sheet-sync'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildStoreCustomersWhere } from '@/lib/customer-list-query'
import { CUSTOMER_TYPES } from '@/lib/customer-types'

const BULK_LIMIT = 1000

// 担当顧客の一括操作（店舗）。現状はタイプ変更のみ対応
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (!(sessionUser.role === 'store' && sessionUser.id === id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { action, ids, filters, payload } = body as {
    action: 'setType'; ids?: string[]; filters?: string; payload?: any
  }

  // 対象は必ず自店舗の担当顧客に限定する
  let where: any
  if (ids && ids.length > 0) {
    if (ids.length > BULK_LIMIT) {
      return NextResponse.json({ error: `一度に操作できるのは${BULK_LIMIT}件までです` }, { status: 400 })
    }
    where = { id: { in: ids }, storeId: id, mergedIntoUserId: null }
  } else if (typeof filters === 'string') {
    where = buildStoreCustomersWhere(id, new URLSearchParams(filters))
    const count = await prisma.user.count({ where })
    if (count === 0) return NextResponse.json({ error: '対象の顧客がいません' }, { status: 400 })
    if (count > BULK_LIMIT) {
      return NextResponse.json({ error: `対象が${count}件あります。条件を絞ってください` }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'ids または filters が必要です' }, { status: 400 })
  }

  if (action !== 'setType') {
    return NextResponse.json({ error: '不明なアクションです' }, { status: 400 })
  }
  const customerType = payload?.customerType
  if (!customerType || !(CUSTOMER_TYPES as readonly string[]).includes(customerType)) {
    return NextResponse.json({ error: '顧客タイプが不正です' }, { status: 400 })
  }

  // 一括変更は主タイプの置き換え。表示に使う customerTypes 配列も揃える
  // updateMany は対象IDを返さないため、シート反映用に事前に控える
  const affected = await prisma.user.findMany({ where, select: { id: true } })

  const result = await prisma.user.updateMany({
    where,
    data: { customerType, customerTypes: JSON.stringify([customerType]) },
  })
  after(() => autoSyncCustomerRows(affected.map(u => u.id)))
  console.log(`[BulkAction] store=${id} action=setType affected=${result.count}`)

  return NextResponse.json({ ok: true, count: result.count })
}
