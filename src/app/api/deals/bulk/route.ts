import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { buildAdminDealsWhere } from '@/lib/deal-list-query'
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

// 案件の一括操作（管理者）。status/category/担当メンバーの一括変更。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: BulkBody = await request.json()
  const { action, value, ids, filters } = body

  // 対象のwhere条件
  let where: any
  if (ids && ids.length > 0) {
    if (ids.length > BULK_LIMIT) return NextResponse.json({ error: `一度に操作できるのは${BULK_LIMIT}件までです` }, { status: 400 })
    where = { id: { in: ids } }
  } else if (typeof filters === 'string') {
    where = buildAdminDealsWhere(new URLSearchParams(filters))
    const count = await prisma.deal.count({ where })
    if (count === 0) return NextResponse.json({ error: '対象の案件がありません' }, { status: 400 })
    if (count > BULK_LIMIT) return NextResponse.json({ error: `対象が${count}件あります。一度に操作できるのは${BULK_LIMIT}件までです。条件を絞ってください` }, { status: 400 })
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
      // アキクル案件は対応サービスに「アキクル」を含む店舗のみ扱える
      if (value === 'akikuru') {
        const targetDeals = await prisma.deal.findMany({
          where, select: { storeId: true }, distinct: ['storeId'],
        })
        const storeIds = targetDeals.map(d => d.storeId).filter((v): v is string => !!v)
        if (storeIds.length > 0) {
          const stores = await prisma.store.findMany({
            where: { id: { in: storeIds } }, select: { name: true, supportedServices: true },
          })
          const unsupported = stores.filter(s => !storeSupportsAkikuru(s.supportedServices))
          if (unsupported.length > 0) {
            return NextResponse.json({
              error: `アキクル非対応の店舗が含まれています（${unsupported.map(s => s.name).slice(0, 3).join('、')}${unsupported.length > 3 ? ' ほか' : ''}）`,
            }, { status: 400 })
          }
        }
      }
      data = { category: value }
      label = `カテゴリー→${DEAL_CATEGORY_LABEL[value] ?? value}`
      break
    }
    case 'member': {
      if (value) {
        const member = await prisma.storeMember.findUnique({ where: { id: value }, select: { id: true, name: true } })
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
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null,
    action: `案件を一括更新（${label}・${result.count}件）`, req: request,
  })

  return NextResponse.json({ ok: true, count: result.count })
}
