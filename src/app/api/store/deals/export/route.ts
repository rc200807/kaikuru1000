import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'
import { buildStoreDealsWhere, jstTodayStart, parseDealSort } from '@/lib/deal-list-query'
import { DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'
import { formatDealNumber } from '@/lib/deal-number'
import { withAssigneeNames } from '@/lib/deal-assignee'

const EXPORT_LIMIT = 2000

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function jstDate(d: Date | string | null): string {
  if (!d) return ''
  const j = new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000)
  return `${j.getUTCFullYear()}/${String(j.getUTCMonth() + 1).padStart(2, '0')}/${String(j.getUTCDate()).padStart(2, '0')}`
}

/**
 * 案件一覧のCSVエクスポート（店舗ポータル）。一覧と同じ絞り込み条件をそのまま使う。
 * ids 指定時も店舗スコープを必ず AND する（他店舗の案件を抜けないようにする）。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const scope = await resolveStoreScope(sessionUser.id, searchParams.get('storeIds'))

  const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  const where = ids.length > 0
    ? { id: { in: ids }, storeId: { in: scope.storeIds } }
    : buildStoreDealsWhere(scope.storeIds, searchParams)

  const dealRows = await prisma.deal.findMany({
    where,
    orderBy: parseDealSort(searchParams),
    take: EXPORT_LIMIT,
    select: {
      id: true, memberId: true,
      dealNumber: true, createdAt: true, occurredAt: true, status: true, category: true,
      purchaseAmount: true, billingAmount: true, preConsentAt: true, inquiryId: true,
      user: { select: { name: true, phone: true, customerType: true, leadSource: true } },
      store: { select: { name: true } },
      member: { select: { name: true } },
      salesContract: { select: { id: true } },
      visitSchedules: {
        where: { status: { not: 'cancelled' }, visitDate: { gte: jstTodayStart() } },
        orderBy: { visitDate: 'asc' }, take: 1,
        select: { visitDate: true },
      },
      _count: { select: { visitSchedules: true } },
    },
  })
  // 担当は Deal.memberId が正だが、案件詳細で設定した担当者は訪問側にしか入らないため補完する
  const deals = await withAssigneeNames(dealRows)

  const withStore = scope.isMulti
  const header = [
    '案件番号', '作成日', '案件発生日', '顧客名', '電話',
    ...(withStore ? ['店舗'] : []),
    'ステータス', 'カテゴリー', '買取金額', '請求金額', '次回訪問日',
    '事前同意', '契約書', '訪問数', '流入経路', '顧客種別', '担当', '由来',
  ]
  const rows = deals.map(d => [
    formatDealNumber(d.dealNumber),
    jstDate(d.createdAt),
    jstDate(d.occurredAt),
    d.user?.name ?? '',
    d.user?.phone ?? '',
    ...(withStore ? [d.store?.name ?? '未割当'] : []),
    DEAL_STATUS_LABEL[d.status as keyof typeof DEAL_STATUS_LABEL] ?? d.status,
    DEAL_CATEGORY_LABEL[(d.category ?? 'purchase') as keyof typeof DEAL_CATEGORY_LABEL] ?? d.category ?? '',
    d.purchaseAmount ?? '',
    d.billingAmount ?? '',
    d.visitSchedules[0] ? jstDate(d.visitSchedules[0].visitDate) : '',
    d.preConsentAt ? '取得済み' : '未取得',
    d.salesContract ? 'あり' : 'なし',
    d._count.visitSchedules,
    d.user?.leadSource ?? '',
    d.user?.customerType ? ((CUSTOMER_TYPE_LABEL as Record<string, string>)[d.user.customerType] ?? d.user.customerType) : '',
    d.assigneeName ?? '',
    d.inquiryId ? '問い合わせ由来' : '手動作成',
  ])

  console.log(`[StoreDealExport] store=${sessionUser.id} scope=${scope.storeIds.length} rows=${deals.length} ids=${ids.length > 0}`)

  const csv = '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
  const stamp = jstDate(new Date()).replace(/\//g, '')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="deals_${stamp}.csv"`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
