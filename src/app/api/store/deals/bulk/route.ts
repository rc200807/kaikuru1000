import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { buildStoreDealsWhere } from '@/lib/deal-list-query'
import { isDealStatus, DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { isDealCategory, DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import { storeSupportsAkikuru } from '@/lib/store-services'

const BULK_LIMIT = 1000

type BulkBody = {
  action: 'status' | 'category' | 'member'
  value: string          // status値 / category値 / memberId（空文字＝担当解除）
  ids?: string[]         // 明示選択された案件ID
  filters?: string       // 「該当する全件」選択時: 一覧APIと同じクエリ文字列
}

/**
 * 案件の一括操作（店舗ポータル）。
 * 書き込みは常にログイン中の店舗の案件だけに限定する（ids 指定でも storeId を AND する）。
 * 管理用の /api/deals/bulk に store ロールを足すのではなく別エンドポイントにしているのは、
 * ids 分岐に店舗の絞り込みが無く他店舗の案件を書き換えられてしまうため。
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = sessionUser.id as string

  const body: BulkBody = await request.json().catch(() => ({} as BulkBody))
  const { action, value, ids, filters } = body

  // 対象のwhere条件（storeId は必ず固定）
  let where: any
  if (ids && ids.length > 0) {
    if (ids.length > BULK_LIMIT) {
      return NextResponse.json({ error: `一度に操作できるのは${BULK_LIMIT}件までです` }, { status: 400 })
    }
    where = { id: { in: ids }, storeId }
  } else if (typeof filters === 'string') {
    where = buildStoreDealsWhere([storeId], new URLSearchParams(filters))
    const count = await prisma.deal.count({ where })
    if (count === 0) return NextResponse.json({ error: '対象の案件がありません' }, { status: 400 })
    if (count > BULK_LIMIT) {
      return NextResponse.json({ error: `対象が${count}件あります。一度に操作できるのは${BULK_LIMIT}件までです。条件を絞ってください` }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'ids または filters が必要です' }, { status: 400 })
  }

  let data: any
  let label: string
  switch (action) {
    case 'status': {
      if (!isDealStatus(value)) return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
      data = { status: value }
      label = `ステータス→${DEAL_STATUS_LABEL[value] ?? value}`
      break
    }
    case 'category': {
      if (!isDealCategory(value)) return NextResponse.json({ error: '無効なカテゴリーです' }, { status: 400 })
      // アキクル案件は対応サービスに「アキクル」を含む店舗のみ扱える（対象はセッション店舗のみ）
      if (value === 'akikuru') {
        const store = await prisma.store.findUnique({ where: { id: storeId }, select: { supportedServices: true } })
        if (!storeSupportsAkikuru(store?.supportedServices)) {
          return NextResponse.json({ error: 'この店舗はアキクルに対応していません' }, { status: 400 })
        }
      }
      data = { category: value }
      label = `カテゴリー→${DEAL_CATEGORY_LABEL[value] ?? value}`
      break
    }
    case 'member': {
      if (value) {
        // 自店舗のメンバーのみ割り当て可（findUnique だと他店舗メンバーを指定できてしまう）
        const member = await prisma.storeMember.findFirst({
          where: { id: value, storeId },
          select: { id: true, name: true },
        })
        if (!member) return NextResponse.json({ error: '担当メンバーが見つかりません' }, { status: 404 })
        data = { memberId: value }
        label = `担当→${member.name}`
      } else {
        data = { memberId: null }
        label = '担当を解除'
      }
      break
    }
    default:
      return NextResponse.json({ error: '無効な操作です' }, { status: 400 })
  }

  const result = await prisma.deal.updateMany({ where, data })

  await recordAccessLog({
    userType: sessionUser.role, userId: storeId, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null,
    action: `案件を一括更新（${label}・${result.count}件）`, req: request,
  })

  return NextResponse.json({ ok: true, count: result.count })
}
