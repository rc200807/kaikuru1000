import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDealWithNumber } from '@/lib/deal-number-server'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'
import { isDealCategory, dealCategoryFromCustomerType } from '@/lib/deal-categories'
import { storeSupportsAkikuru } from '@/lib/store-services'
import { resolveStoreScope } from '@/lib/store-scope'
import { buildDealFilterConditions, parseDealSort } from '@/lib/deal-list-query'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

// 案件一覧（店舗＝自店舗のみ／管理者＝全件）。あらゆる条件でサーバー側検索・絞り込み・並び替え。
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const maxLimit = isAdmin ? 2000 : 200
  const limit = Math.max(1, Math.min(maxLimit, parseInt(searchParams.get('limit') || '50', 10)))

  // ベース条件（店舗スコープ）。管理者は店舗指定をフィルタ条件側で処理する。
  const baseWhere: any = {}
  if (isStore) {
    const scope = await resolveStoreScope(sessionUser.id, searchParams.get('storeIds'))
    baseWhere.storeId = scope.isMulti ? { in: scope.storeIds } : sessionUser.id
  }

  const conditions = buildDealFilterConditions(searchParams, { admin: isAdmin })
  const where: any = { ...baseWhere }
  if (conditions.length > 0) where.AND = conditions

  // 集計モード（フィルタ連動サマリー）。
  // countsByStatus はステータス絞り以外の条件を反映（チップ件数・成約率用）、
  // filtered は全条件を反映（件数・買取合計・平均）。
  if (searchParams.get('stats') === '1') {
    const spNoStatus = new URLSearchParams(searchParams.toString())
    spNoStatus.delete('statuses')
    spNoStatus.delete('status')
    const condNoStatus = buildDealFilterConditions(spNoStatus, { admin: isAdmin })
    const whereNoStatus: any = { ...baseWhere }
    if (condNoStatus.length > 0) whereNoStatus.AND = condNoStatus

    const [grouped, agg] = await Promise.all([
      prisma.deal.groupBy({ by: ['status'], where: whereNoStatus, _count: { _all: true } }),
      prisma.deal.aggregate({ where, _count: { _all: true }, _sum: { purchaseAmount: true } }),
    ])
    const counts: Record<string, number> = {}
    let statsTotal = 0
    for (const g of grouped) { counts[g.status] = g._count._all; statsTotal += g._count._all }
    const won = (counts['contract'] || 0) + (counts['completed'] || 0)
    const winRate = statsTotal > 0 ? Math.round((won / statsTotal) * 1000) / 10 : 0
    const count = agg._count._all
    const purchaseSum = agg._sum.purchaseAmount || 0
    const purchaseAvg = count > 0 ? Math.round(purchaseSum / count) : 0
    return NextResponse.json({ stats: { counts, total: statsTotal, won, winRate, filtered: { count, purchaseSum, purchaseAvg } } })
  }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, customerType: true, leadSource: true } },
        store: { select: { id: true, name: true, code: true } },
        inquiry: { select: { id: true, inquiryType: true } },
        member: { select: { id: true, name: true } },
        salesContract: { select: { id: true } },
        _count: { select: { visitSchedules: true } },
      },
      orderBy: parseDealSort(searchParams),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ])

  return NextResponse.json({ deals, total, page, limit })
}

// 案件作成（店舗・管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { userId, detail, status, occurredAt, category } = body

  if (!userId) {
    return NextResponse.json({ error: '顧客が指定されていません' }, { status: 400 })
  }
  if (status !== undefined && !isDealStatus(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }
  if (category !== undefined && category !== null && !isDealCategory(category)) {
    return NextResponse.json({ error: '無効なカテゴリーです' }, { status: 400 })
  }
  // 案件発生日（指定なければ now）。不正値は now にフォールバック。
  let occurredAtDate: Date | undefined
  if (occurredAt) {
    const d = new Date(occurredAt)
    if (!isNaN(d.getTime())) occurredAtDate = d
  }

  // 対象顧客の存在と（店舗の場合は）所有権を確認
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, storeId: true, customerType: true },
  })
  if (!targetUser) {
    return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
  }

  let finalStoreId: string | null
  if (isStore) {
    if (targetUser.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    finalStoreId = sessionUser.id
  } else {
    // 管理者: 指定があればその店舗、なければ顧客の担当店舗（未割当なら null）
    finalStoreId = (body.storeId ?? targetUser.storeId) ?? null
  }

  // カテゴリー: 指定があればそれを、なければ顧客種別から既定値を導出
  const finalCategory = isDealCategory(category)
    ? category
    : dealCategoryFromCustomerType(targetUser.customerType)

  // アキクル案件は対応サービスに「アキクル」を含む店舗のみ扱える（storeId 未割当は許容）
  if (finalCategory === 'akikuru' && finalStoreId) {
    const targetStore = await prisma.store.findUnique({
      where: { id: finalStoreId }, select: { supportedServices: true },
    })
    if (!storeSupportsAkikuru(targetStore?.supportedServices)) {
      return NextResponse.json({ error: 'この店舗はアキクルに対応していません' }, { status: 400 })
    }
  }

  // 案件番号（例: 20260824001）を採番して作成する
  const deal = await createDealWithNumber({
    data: {
      userId,
      storeId: finalStoreId,
      detail: detail || null,
      status: isDealStatus(status) ? status : 'inquiry',
      category: finalCategory,
      ...(occurredAtDate ? { occurredAt: occurredAtDate } : {}),
      createdByType: sessionUser.role ?? null,
      createdById: sessionUser.id ?? null,
      createdByName: sessionUser.name ?? null,
      memberId: sessionUser.memberId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, customerType: true } },
      store: { select: { id: true, name: true, code: true } },
      _count: { select: { visitSchedules: true } },
    },
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `案件を作成「${deal.user.name}」`, req: request })
  return NextResponse.json(deal, { status: 201 })
}
