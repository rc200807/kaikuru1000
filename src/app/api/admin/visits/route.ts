import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 全店舗の訪問記録一覧（管理者のみ）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q       = searchParams.get('q')       || ''    // フリーワード（顧客名・フリガナ・メール）
  const storeId = searchParams.get('storeId') || ''    // 店舗ID
  const status  = searchParams.get('status')  || ''    // ステータス
  const from    = searchParams.get('from')    || ''    // 開始日（ISO）
  const to      = searchParams.get('to')      || ''    // 終了日（ISO）
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit   = Math.min(200, parseInt(searchParams.get('limit') || '100'))

  const where: any = {}
  const includeTestData = searchParams.get('includeTestData') === 'true'

  if (!includeTestData) {
    where.user = { isTestData: false }
  }

  if (storeId) {
    where.storeId = storeId
  }
  if (status) {
    where.status = status
  }
  if (from || to) {
    where.visitDate = {}
    if (from) where.visitDate.gte = new Date(from)
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      where.visitDate.lte = toDate
    }
  }
  if (q) {
    where.user = {
      ...(where.user || {}),
      OR: [
        { name:     { contains: q, mode: 'insensitive' } },
        { furigana: { contains: q, mode: 'insensitive' } },
        { email:    { contains: q, mode: 'insensitive' } },
        { phone:    { contains: q } },
      ],
    }
  }

  const [total, records] = await Promise.all([
    prisma.visitSchedule.count({ where }),
    prisma.visitSchedule.findMany({
      where,
      include: {
        user:  { select: { id: true, name: true, furigana: true, email: true, phone: true, address: true } },
        store: { select: { id: true, name: true, code: true } },
      },
      orderBy: { visitDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ total, page, limit, records })
}
