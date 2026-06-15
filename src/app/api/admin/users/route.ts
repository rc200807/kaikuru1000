import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'
  const customerType = searchParams.get('customerType') || ''
  const storeId = searchParams.get('storeId') || ''
  const search = (searchParams.get('search') || '').trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))

  const where: any = {}
  if (!includeInactive) where.isActive = true
  // 担当店舗フィルタ（unassigned=未割り当て）
  if (storeId === 'unassigned') where.storeId = null
  else if (storeId) where.storeId = storeId

  const and: any[] = []
  if (customerType) {
    // 主タイプ or customerTypes JSON 配列のどちらかに含まれていればマッチ
    and.push({ OR: [{ customerType }, { customerTypes: { contains: `"${customerType}"` } }] })
  }
  // 全顧客対象の検索（氏名・ふりがな・メール・電話）
  if (search) {
    const digits = search.replace(/[-ー\s]/g, '')
    and.push({ OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { furigana: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      ...(digits && digits !== search ? [{ phone: { contains: digits } }] : []),
    ] })
  }
  if (and.length > 0) where.AND = and

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        licenseKey: { select: { key: true } },
        visitSchedules: {
          where: { visitDate: { gte: new Date() }, status: 'scheduled' },
          orderBy: { visitDate: 'asc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    users: users.map(({ password: _, ...u }) => u),
    total,
    page,
    limit,
  })
}
