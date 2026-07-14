import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const search = (searchParams.get('search') || '').trim()

  // 検索: 全担当顧客を対象に氏名・ふりがな・メール・電話で部分一致（電話はハイフン無しでも一致）
  const where: any = { storeId: id, mergedIntoUserId: null } // 統合で吸収された顧客は一覧に出さない
  if (search) {
    const phoneDigits = search.replace(/[-ー\s]/g, '')
    where.OR = [
      { name:     { contains: search, mode: 'insensitive' } },
      { furigana: { contains: search, mode: 'insensitive' } },
      { email:    { contains: search, mode: 'insensitive' } },
      { phone:    { contains: search } },
      ...(phoneDigits && phoneDigits !== search ? [{ phone: { contains: phoneDigits } }] : []),
    ]
  }

  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
      id: true, name: true, furigana: true,
      lastName: true, firstName: true, lastNameKana: true, firstNameKana: true,
      email: true, phone: true, phone2: true, phone3: true, address: true,
      internalNote: true,
      idDocumentPath: true, createdAt: true,
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
    orderBy: { name: 'asc' },
    skip: (page - 1) * limit,
    take: limit,
  }),
    prisma.user.count({ where }),
  ])

  // 最終訪問日（過去のキャンセル以外の訪問のうち最新）をまとめて取得
  const ids = customers.map(c => c.id)
  const now = new Date()
  const pastVisits = ids.length > 0
    ? await prisma.visitSchedule.findMany({
        where: { userId: { in: ids }, visitDate: { lt: now }, status: { not: 'cancelled' } },
        orderBy: { visitDate: 'desc' },
        select: { userId: true, visitDate: true },
      })
    : []
  const lastVisitByUser = new Map<string, Date>()
  for (const v of pastVisits) {
    if (!lastVisitByUser.has(v.userId)) lastVisitByUser.set(v.userId, v.visitDate)
  }

  // idDocumentPath をプロキシ URL に変換（Blob URL をクライアントに露出しない）
  const result = customers.map(c => {
    const next = c.visitSchedules?.[0] ?? null
    return {
      ...c,
      idDocumentPath: c.idDocumentPath ? `/api/users/${c.id}/id-document` : null,
      // 登録日は createdAt をそのまま利用
      lastVisitDate: lastVisitByUser.get(c.id) ?? null,
      nextVisit: next ? { visitDate: next.visitDate, startTime: next.startTime ?? null } : null,
    }
  })

  return NextResponse.json({ customers: result, total, page, limit })
}
