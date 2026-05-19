import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId') || ''
  const categoryId = searchParams.get('categoryId') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const aiOnly = searchParams.get('aiOnly') === 'true'
  const q = (searchParams.get('q') || '').trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '60', 10)))

  const where: any = {}
  if (categoryId) where.categoryId = categoryId
  if (aiOnly) where.aiResearch = { not: null }
  if (q) {
    where.OR = [
      { itemName: { contains: q, mode: 'insensitive' } },
      { janCode: { contains: q } },
    ]
  }
  const visitFilter: any = {}
  if (storeId) visitFilter.storeId = storeId
  if (from || to) {
    visitFilter.visitDate = {}
    if (from) visitFilter.visitDate.gte = new Date(from)
    if (to) {
      // 終端日を含めるため翌日 0:00 未満にする
      const end = new Date(to)
      end.setDate(end.getDate() + 1)
      visitFilter.visitDate.lt = end
    }
  }
  if (Object.keys(visitFilter).length > 0) {
    where.visitSchedule = { is: visitFilter }
  }

  const [items, total] = await Promise.all([
    prisma.purchaseItem.findMany({
      where,
      include: {
        visitSchedule: {
          select: {
            id: true,
            visitDate: true,
            store: { select: { id: true, name: true, code: true } },
            user: { select: { id: true, name: true } },
          },
        },
        purchaseCategory: { select: { id: true, name: true } },
      },
      orderBy: [
        { visitSchedule: { visitDate: 'desc' } },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchaseItem.count({ where }),
  ])

  return NextResponse.json({ items, total, page, limit })
}
