import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildStoreCustomersWhere, parseCustomerSort } from '@/lib/customer-list-query'
import { createTimer } from '@/lib/api-timing'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 店舗アカウントは自分の担当顧客のみ
  if (sessionUser.role === 'store' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))

  // 検索・タイプ・登録日・訪問状況などの絞り込みは共有ヘルパーで解釈（全担当顧客対象）
  const where = buildStoreCustomersWhere(id, searchParams)
  const orderBy = parseCustomerSort(searchParams, { name: 'asc' })

  const t = createTimer()
  const [customers, total] = await t.measure('list', () => Promise.all([
    prisma.user.findMany({
      where,
      select: {
      id: true, name: true, furigana: true,
      lastName: true, firstName: true, lastNameKana: true, firstNameKana: true,
      email: true, phone: true, phone2: true, phone3: true, postalCode: true, address: true,
      internalNote: true,
      idDocumentPath: true, createdAt: true,
      lastVisitedAt: true,   // CSVインポートで引き継いだ最終訪問日
      // 顧客タイプ
      customerType: true,
      // 身分証OCR抽出フィールド
      idDocumentType: true, idName: true, idBirthDate: true,
      idAddress: true, idLicenseNumber: true, idExpiryDate: true,
      idOcrIssueReport: true, // 顧客からの誤り報告
      // 振込先口座情報
      bankName: true, branchName: true, accountType: true,
      accountNumber: true, accountHolder: true,
      visitSchedules: {
        where: { visitDate: { gte: new Date() }, status: 'scheduled' },
        orderBy: { visitDate: 'asc' },
        take: 1,
      },
    },
    orderBy,
    skip: (page - 1) * limit,
    take: limit,
  }),
    prisma.user.count({ where }),
  ]))

  // 最終訪問日（過去のキャンセル以外の訪問のうち最新）をまとめて取得
  const ids = customers.map(c => c.id)
  const now = new Date()
  // 顧客ごとの最終訪問日は groupBy(_max) でDB側だけで求める。
  // 以前は該当顧客の過去訪問を全行取ってJS側で先頭を拾っていたため、
  // 訪問履歴が多い顧客が並ぶと1ページ表示で数百〜数千行を転送していた。
  const lastVisitRows = ids.length > 0
    ? await t.measure('lastVisit', () => prisma.visitSchedule.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, visitDate: { lt: now }, status: { not: 'cancelled' } },
        _max: { visitDate: true },
      }))
    : []
  const lastVisitByUser = new Map<string, Date>()
  for (const row of lastVisitRows) {
    if (row._max.visitDate) lastVisitByUser.set(row.userId, row._max.visitDate)
  }
  // CSVインポートで引き継いだ最終訪問日は、訪問レコードが無い（または古い）ときに採用する
  const pickLastVisit = (visitDate: Date | null, imported: Date | null): Date | null => {
    if (visitDate && imported) return visitDate > imported ? visitDate : imported
    return visitDate ?? imported
  }

  // idDocumentPath をプロキシ URL に変換（Blob URL をクライアントに露出しない）
  const result = customers.map(c => {
    const next = c.visitSchedules?.[0] ?? null
    return {
      ...c,
      idDocumentPath: c.idDocumentPath ? `/api/users/${c.id}/id-document` : null,
      // 登録日は createdAt をそのまま利用
      lastVisitDate: pickLastVisit(lastVisitByUser.get(c.id) ?? null, c.lastVisitedAt ?? null),
      nextVisit: next ? { visitDate: next.visitDate, startTime: next.startTime ?? null } : null,
    }
  })

  return t.json({ customers: result, total, page, limit })
}
