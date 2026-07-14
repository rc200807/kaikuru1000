import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'
import { startOfMonth } from 'date-fns'
import { buildStoreDashboard } from '@/lib/store-dashboard-data'

// 管理ポータル: 店舗別ダッシュボード
// 店舗ポータルのダッシュボードと同じ集計（買取推移・訪問・案件・ランキング等）に加え、
// 管理側専用の情報（メンバー実績・顧客タイプ内訳・問い合わせ・アクセス状況・未対応案件）を返す。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: storeId } = await params
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    base,
    members,
    monthVisits, monthDeals,
    customerTypeAgg,
    inquiryTotal, inquiryMonth,
    lastStoreLogin, logins30d, ops30d,
    pendingDealCount, visitDecidedCount,
  ] = await Promise.all([
    // 店舗ダッシュボードと同一の集計（管理向けはランキング金額も開示）
    buildStoreDashboard(storeId, { revealAmounts: true }),
    prisma.storeMember.findMany({
      where: { storeId },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    // 当月の訪問・案件（メンバー実績の振り分け用）
    prisma.visitSchedule.findMany({
      where: { storeId, visitDate: { gte: currentMonthStart } },
      select: { memberId: true, staffName: true, status: true, purchaseAmount: true },
    }),
    prisma.deal.findMany({
      where: { storeId, createdAt: { gte: currentMonthStart } },
      select: { memberId: true, createdByName: true, createdByType: true },
    }),
    prisma.user.groupBy({
      by: ['customerType'],
      where: { storeId, mergedIntoUserId: null, isActive: true },
      _count: { _all: true },
    }),
    prisma.inquiry.count({ where: { storeId } }),
    prisma.inquiry.count({ where: { storeId, createdAt: { gte: currentMonthStart } } }),
    prisma.accessLog.findFirst({
      where: { userType: 'store', userId: storeId, action: 'login' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, userName: true },
    }),
    prisma.accessLog.count({
      where: { userType: 'store', userId: storeId, action: 'login', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.accessLog.count({
      where: { userType: 'store', userId: storeId, action: { not: 'login' }, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.deal.count({ where: { storeId, status: 'inquiry' } }),
    prisma.deal.count({ where: { storeId, status: 'visit_decided' } }),
  ])

  // ── メンバー別 当月実績（memberId 帰属を優先し、過去分は担当者名で振り分け） ──
  const memberIds = members.map(m => m.id)
  type Perf = { visitCount: number; completedCount: number; purchaseAmount: number; dealCount: number }
  const perfByKey = new Map<string, Perf>() // key: "id:<memberId>" or "name:<担当者名>"
  const ensure = (key: string): Perf => {
    let p = perfByKey.get(key)
    if (!p) { p = { visitCount: 0, completedCount: 0, purchaseAmount: 0, dealCount: 0 }; perfByKey.set(key, p) }
    return p
  }
  for (const v of monthVisits) {
    const key = v.memberId ? `id:${v.memberId}` : v.staffName?.trim() ? `name:${v.staffName.trim()}` : null
    if (!key) continue
    const p = ensure(key)
    p.visitCount++
    if (v.status === 'completed') { p.completedCount++; p.purchaseAmount += v.purchaseAmount ?? 0 }
  }
  for (const d of monthDeals) {
    const key = d.memberId ? `id:${d.memberId}` : (d.createdByType === 'store' && d.createdByName?.trim()) ? `name:${d.createdByName.trim()}` : null
    if (!key) continue
    ensure(key).dealCount++
  }

  // 他店舗メンバーのIDが帰属している場合の名前解決（店舗切替で作業したケース）
  const foreignIds = [...perfByKey.keys()]
    .filter(k => k.startsWith('id:'))
    .map(k => k.slice(3))
    .filter(mid => !memberIds.includes(mid))
  const foreignMembers = foreignIds.length > 0
    ? await prisma.storeMember.findMany({
        where: { id: { in: foreignIds } },
        select: { id: true, name: true, store: { select: { name: true } } },
      })
    : []

  // 各メンバーの最終ログイン（memberId 帰属 + 過去分は userName 照合）
  const [loginById, loginByName] = await Promise.all([
    memberIds.length > 0
      ? prisma.accessLog.groupBy({
          by: ['memberId'],
          where: { memberId: { in: memberIds }, action: 'login' },
          _max: { createdAt: true },
        })
      : Promise.resolve([] as any[]),
    prisma.accessLog.groupBy({
      by: ['userName'],
      where: { memberId: null, userType: 'store', userId: storeId, action: 'login' },
      _max: { createdAt: true },
    }),
  ])
  const lastLoginById = new Map(loginById.map((g: any) => [g.memberId, g._max.createdAt]))
  const lastLoginByName = new Map(loginByName.map((g: any) => [g.userName?.trim(), g._max.createdAt]))

  const memberPerformance = [
    // 自店舗の登録メンバー（実績ゼロでも並べる）
    ...members.map(m => {
      const byId = perfByKey.get(`id:${m.id}`)
      const byName = perfByKey.get(`name:${m.name.trim()}`)
      const perf: Perf = {
        visitCount: (byId?.visitCount ?? 0) + (byName?.visitCount ?? 0),
        completedCount: (byId?.completedCount ?? 0) + (byName?.completedCount ?? 0),
        purchaseAmount: (byId?.purchaseAmount ?? 0) + (byName?.purchaseAmount ?? 0),
        dealCount: (byId?.dealCount ?? 0) + (byName?.dealCount ?? 0),
      }
      // 二重計上防止のため消費済みキーを除去
      perfByKey.delete(`id:${m.id}`)
      perfByKey.delete(`name:${m.name.trim()}`)
      const lastById = lastLoginById.get(m.id) as Date | undefined
      const lastByName = lastLoginByName.get(m.name.trim()) as Date | undefined
      const lastLoginAt = [lastById, lastByName].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null
      return { memberId: m.id, name: m.name, avatar: m.avatar, isForeign: false, ...perf, lastLoginAt }
    }),
    // 他店舗メンバー・未登録の担当者名（残ったキー）
    ...[...perfByKey.entries()].map(([key, perf]) => {
      if (key.startsWith('id:')) {
        const fm = foreignMembers.find(f => f.id === key.slice(3))
        return { memberId: key.slice(3), name: fm ? `（${fm.store.name}）${fm.name}` : '不明なメンバー', avatar: null, isForeign: true, ...perf, lastLoginAt: null }
      }
      return { memberId: null, name: key.slice(5), avatar: null, isForeign: false, ...perf, lastLoginAt: null }
    }),
  ].sort((a, b) => b.purchaseAmount - a.purchaseAmount || b.visitCount - a.visitCount)

  const customerTypeBreakdown = customerTypeAgg
    .map(g => ({ type: g.customerType, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    ...base,
    store,
    memberPerformance,
    customerTypeBreakdown,
    inquiries: { total: inquiryTotal, currentMonth: inquiryMonth },
    accessActivity: {
      lastLoginAt: lastStoreLogin?.createdAt ?? null,
      lastLoginName: lastStoreLogin?.userName ?? null,
      logins30d,
      operations30d: ops30d,
    },
    pendingDealCount,
    visitDecidedCount,
  })
}
