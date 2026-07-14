import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'

// 全店舗アクティビティフィード（管理者向け。sysadmin版とは別に requireRole でゲート）
// params: storeId（=AccessLog.userId）, userType, action(login|operation), from, to, page, limit
export async function GET(request: NextRequest) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '30', 10) || 30))
  const storeId = searchParams.get('storeId') || ''
  const userType = searchParams.get('userType') || ''
  const action = searchParams.get('action') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''

  const where: any = {}
  if (storeId) { where.userType = 'store'; where.userId = storeId }
  else if (userType) where.userType = userType
  if (action === 'login') where.action = 'login'
  else if (action === 'operation') where.action = { not: 'login' }
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00+09:00`)
    if (to) where.createdAt.lt = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000)
  }

  const [items, total] = await Promise.all([
    prisma.accessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, userType: true, userId: true, userName: true, memberId: true, action: true, ip: true, createdAt: true },
    }),
    prisma.accessLog.count({ where }),
  ])

  // 店舗名の解決（userType=store の行のみ）
  const storeIds = [...new Set(items.filter(i => i.userType === 'store' && i.userId).map(i => i.userId as string))]
  const stores = storeIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const storeNameMap = new Map(stores.map(s => [s.id, s.name]))

  return NextResponse.json({
    items: items.map(i => ({
      ...i,
      storeName: i.userType === 'store' && i.userId ? storeNameMap.get(i.userId) ?? null : null,
    })),
    total,
    page,
    limit,
  })
}
