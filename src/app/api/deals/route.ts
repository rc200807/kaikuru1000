import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'
import { isDealCategory, dealCategoryFromCustomerType } from '@/lib/deal-categories'
import { resolveStoreScope } from '@/lib/store-scope'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

// 案件一覧（店舗＝自店舗のみ／管理者＝全件）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')
  const userId = searchParams.get('userId')
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const maxLimit = isAdmin ? 2000 : 200
  const limit = Math.max(1, Math.min(maxLimit, parseInt(searchParams.get('limit') || '50', 10)))

  const where: any = {}
  if (isStore) {
    // 運営者スコープ（?storeIds=）対応。同一運営者所属をサーバ側で検証（不正IDは除外）
    const scope = await resolveStoreScope(sessionUser.id, searchParams.get('storeIds'))
    where.storeId = scope.isMulti ? { in: scope.storeIds } : sessionUser.id
  } else if (storeId) where.storeId = storeId
  if (userId) where.userId = userId

  // 集計モード（成約率・ステータス別件数）。status フィルタは無視し全ステータスの内訳を返す。
  // ページング上限に依存せず正確な件数を出すため groupBy で集計する。
  if (searchParams.get('stats') === '1') {
    const grouped = await prisma.deal.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    })
    const counts: Record<string, number> = {}
    let statsTotal = 0
    for (const g of grouped) {
      counts[g.status] = g._count._all
      statsTotal += g._count._all
    }
    return NextResponse.json({ stats: { counts, total: statsTotal } })
  }

  if (status && status !== 'all') where.status = status
  if (category && category !== 'all' && isDealCategory(category)) where.category = category

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, customerType: true } },
        store: { select: { id: true, name: true, code: true } },
        inquiry: { select: { id: true, inquiryType: true } },
        _count: { select: { visitSchedules: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
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

  const deal = await prisma.deal.create({
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
