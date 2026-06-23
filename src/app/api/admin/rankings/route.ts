import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, startOfYear } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  // period: month | year | all (for customer count ranking)
  const period = searchParams.get('period') ?? 'month'

  const now = new Date()
  let dateGte: Date | undefined
  if (period === 'month') dateGte = startOfMonth(now)
  else if (period === 'year') dateGte = startOfYear(now)

  // --- 店舗別顧客数ランキング（全店舗）---
  const customerGroups = await prisma.user.groupBy({
    by: ['storeId'],
    where: {
      storeId: { not: null },
      ...(dateGte ? { createdAt: { gte: dateGte } } : {}),
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const customerStoreIds = customerGroups
    .map(g => g.storeId)
    .filter((id): id is string => id !== null)

  const customerStores =
    customerStoreIds.length > 0
      ? await prisma.store.findMany({
          where: { id: { in: customerStoreIds } },
          select: { id: true, name: true },
        })
      : []
  const customerStoreMap = new Map(customerStores.map(s => [s.id, s.name]))

  const customerRanking = customerGroups.map(g => ({
    storeId: g.storeId!,
    name: customerStoreMap.get(g.storeId!) ?? '',
    count: g._count.id,
  }))

  // --- 店舗別買取金額ランキング（全期間・全店舗）---
  const purchaseGroups = await prisma.visitSchedule.groupBy({
    by: ['storeId'],
    where: { status: 'completed' },
    _sum: { purchaseAmount: true },
    orderBy: { _sum: { purchaseAmount: 'desc' } },
  })

  const purchaseStoreIds = purchaseGroups.map(g => g.storeId)
  const purchaseStores =
    purchaseStoreIds.length > 0
      ? await prisma.store.findMany({
          where: { id: { in: purchaseStoreIds } },
          select: { id: true, name: true },
        })
      : []
  const purchaseStoreMap = new Map(purchaseStores.map(s => [s.id, s.name]))

  const purchaseRanking = purchaseGroups.map(g => ({
    storeId: g.storeId,
    name: purchaseStoreMap.get(g.storeId) ?? '',
    amount: g._sum.purchaseAmount ?? 0,
  }))

  return NextResponse.json({ customerRanking, purchaseRanking, period })
}
