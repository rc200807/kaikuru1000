import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminDealsWhere, parseDealSort } from '@/lib/deal-list-query'
import { DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { DEAL_CATEGORY_LABEL } from '@/lib/deal-categories'
import { CUSTOMER_TYPE_LABEL } from '@/lib/customer-types'

const EXPORT_LIMIT = 5000

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function jstDate(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return `${j.getUTCFullYear()}/${String(j.getUTCMonth() + 1).padStart(2, '0')}/${String(j.getUTCDate()).padStart(2, '0')}`
}

// 案件一覧CSVエクスポート（管理者）。フィルタ条件は一覧APIと同じ。ids指定時は選択案件のみ。
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  const where = ids.length > 0 ? { id: { in: ids } } : buildAdminDealsWhere(searchParams)

  const deals = await prisma.deal.findMany({
    where,
    include: {
      user: { select: { name: true, phone: true, customerType: true, leadSource: true } },
      store: { select: { name: true } },
      member: { select: { name: true } },
      salesContract: { select: { id: true } },
    },
    orderBy: parseDealSort(searchParams),
    take: EXPORT_LIMIT,
  })

  const header = ['案件番号', '作成日', '顧客名', '電話', '店舗', 'ステータス', 'カテゴリー', '買取金額', '流入経路', '顧客種別', '担当', '由来', '契約書']
  const rows = deals.map(d => [
    d.dealNumber ?? '',
    jstDate(d.createdAt),
    d.user?.name ?? '',
    d.user?.phone ?? '',
    d.store?.name ?? '',
    DEAL_STATUS_LABEL[d.status] ?? d.status,
    DEAL_CATEGORY_LABEL[d.category] ?? d.category,
    d.purchaseAmount ?? '',
    d.user?.leadSource ?? '',
    d.user?.customerType ? ((CUSTOMER_TYPE_LABEL as Record<string, string>)[d.user.customerType] ?? d.user.customerType) : '',
    d.member?.name ?? '',
    d.inquiryId ? '問い合わせ由来' : '手動作成',
    d.salesContract ? 'あり' : 'なし',
  ])

  console.log(`[DealExport] admin=${sessionUser.id} rows=${deals.length} ids=${ids.length > 0}`)

  const csv = '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
  const stamp = jstDate(new Date()).replace(/\//g, '')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="deals_${stamp}.csv"`,
    },
  })
}
