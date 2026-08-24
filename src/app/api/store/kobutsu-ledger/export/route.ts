import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchKobutsuLedgerRows } from '@/lib/kobutsu-ledger-server'
import {
  KOBUTSU_CSV_HEADER,
  KOBUTSU_DEAL_CSV_HEADER,
  groupLedgerRows,
  jstDayBoundary,
  toCsvRow,
  toDealCsvRow,
} from '@/lib/kobutsu-ledger'
import { recordAccessLog } from '@/lib/access-log'
import { formatJstDate } from '@/lib/datetime'

const EXPORT_LIMIT = 5000

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/** yyyy/MM/dd（JST） */
function jstDate(iso: string): string {
  return formatJstDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * 古物台帳のCSVエクスポート（期間指定）。
 * 電子帳簿は「営業所で直ちに書面に表示できる状態」で保存する必要があるため、
 * 期間を指定してそのままExcelで開ける（BOM付き）CSVを出す。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string

  const sp = request.nextUrl.searchParams
  const fromParam = sp.get('from')
  const toParam = sp.get('to')
  // unit=deal: 1案件=1行（一覧と同じ粒度） / 既定 unit=item: 1品目=1行（帳簿の明細）
  const unit = sp.get('unit') === 'deal' ? 'deal' : 'item'

  const [{ rows, truncated }, store] = await Promise.all([
    fetchKobutsuLedgerRows({
      storeId,
      from: jstDayBoundary(fromParam, 'start'),
      to: jstDayBoundary(toParam, 'end'),
      q: sp.get('q'),
      limit: EXPORT_LIMIT,
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true, code: true, antiquePermitNumber: true } }),
  ])

  const groups = unit === 'deal' ? groupLedgerRows(rows) : []
  const count = unit === 'deal' ? groups.length : rows.length

  // 台帳の帳票としての体裁: 営業所名・古物商許可番号・対象期間を先頭に出す
  const periodLabel = `${fromParam || '指定なし'} 〜 ${toParam || '指定なし'}`
  const preamble = [
    ['古物台帳（買受け）'],
    ['営業所', `${store?.name ?? ''}${store?.code ? `（${store.code}）` : ''}`],
    ['古物商許可番号', store?.antiquePermitNumber ?? '（未登録）'],
    ['対象期間', periodLabel],
    ['出力単位', unit === 'deal' ? '案件単位（1案件=1行）' : '明細（1品目=1行）'],
    ['出力日時', formatJstDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })],
    ['件数', String(count) + (truncated ? `（上限${EXPORT_LIMIT}件で打ち切り）` : '')],
    [],
  ]

  const body = unit === 'deal'
    ? [[...KOBUTSU_DEAL_CSV_HEADER], ...groups.map(g => toDealCsvRow(g, jstDate).map(v => String(v)))]
    : [[...KOBUTSU_CSV_HEADER], ...rows.map(r => toCsvRow(r, jstDate).map(v => String(v)))]

  const csv = '﻿' + [...preamble, ...body]
    .map(r => r.map(csvCell).join(','))
    .join('\r\n')

  await recordAccessLog({
    userType: user.role, userId: storeId, userName: user.name, memberId: user.memberId ?? null,
    action: `古物台帳をCSV出力（${periodLabel} / ${unit === 'deal' ? '案件単位' : '明細'} / ${count}件）`, req: request,
  })

  const stamp = (fromParam || 'all').replace(/-/g, '') + '-' + (toParam || 'all').replace(/-/g, '') + (unit === 'deal' ? '_deal' : '')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kobutsu-ledger_${stamp}.csv"`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
