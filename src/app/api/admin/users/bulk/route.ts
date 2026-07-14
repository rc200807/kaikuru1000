import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminUsersWhere } from '@/lib/customer-list-query'
import { CUSTOMER_TYPES } from '@/lib/customer-types'

// 一括操作の対象上限（誤操作・タイムアウト防止）
const BULK_LIMIT = 1000

type BulkBody = {
  action: 'assignStore' | 'setType' | 'setActive' | 'setLeadSource'
  ids?: string[]          // 明示選択された顧客ID
  filters?: string        // 「該当する全件」選択時: 一覧APIと同じクエリ文字列
  payload?: any
}

// 顧客の一括操作（管理者）
// ids（明示選択）と filters（フィルタ該当全件）は排他。一括操作ではメール通知は送信しない。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: BulkBody = await request.json()
  const { action, ids, filters, payload } = body

  // 対象のwhere条件を決定
  let where: any
  if (ids && ids.length > 0) {
    if (ids.length > BULK_LIMIT) {
      return NextResponse.json({ error: `一度に操作できるのは${BULK_LIMIT}件までです` }, { status: 400 })
    }
    where = { id: { in: ids }, mergedIntoUserId: null }
  } else if (typeof filters === 'string') {
    where = buildAdminUsersWhere(new URLSearchParams(filters))
    const count = await prisma.user.count({ where })
    if (count === 0) return NextResponse.json({ error: '対象の顧客がいません' }, { status: 400 })
    if (count > BULK_LIMIT) {
      return NextResponse.json({ error: `対象が${count}件あります。一度に操作できるのは${BULK_LIMIT}件までです。条件を絞ってください` }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'ids または filters が必要です' }, { status: 400 })
  }

  let data: any
  switch (action) {
    case 'assignStore': {
      const storeId = payload?.storeId
      if (!storeId) return NextResponse.json({ error: 'storeId が必要です' }, { status: 400 })
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
      if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
      data = { storeId }
      break
    }
    case 'setType': {
      const customerType = payload?.customerType
      if (!customerType || !(CUSTOMER_TYPES as readonly string[]).includes(customerType)) {
        return NextResponse.json({ error: '顧客タイプが不正です' }, { status: 400 })
      }
      // 一括変更は主タイプの置き換え。表示に使う customerTypes 配列も揃える
      data = { customerType, customerTypes: JSON.stringify([customerType]) }
      break
    }
    case 'setActive': {
      if (typeof payload?.isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive が必要です' }, { status: 400 })
      }
      data = { isActive: payload.isActive }
      break
    }
    case 'setLeadSource': {
      // null で「未設定」に戻せる
      data = { leadSource: payload?.leadSource || null }
      break
    }
    default:
      return NextResponse.json({ error: '不明なアクションです' }, { status: 400 })
  }

  const result = await prisma.user.updateMany({ where, data })
  console.log(`[BulkAction] admin=${sessionUser.id} action=${action} affected=${result.count}`)

  return NextResponse.json({ ok: true, count: result.count })
}
