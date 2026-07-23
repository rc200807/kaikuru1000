import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 直近 N ヶ月のキー配列（古い順）
function lastMonths(n: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(monthKey(d))
  }
  return keys
}

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const months = lastMonths(12)
  const monthSet = new Set(months)
  const since = new Date()
  since.setMonth(since.getMonth() - 11, 1)
  since.setHours(0, 0, 0, 0)

  // ===== 売上（決済済み発注）=====
  const paidOrders = await prisma.supplyOrder.findMany({
    where: { paymentStatus: 'paid' },
    include: { items: true },
  })
  const totalRevenue = paidOrders.reduce((s, o) => s + o.totalAmount, 0)
  const revenueByMonth: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
  for (const o of paidOrders) {
    const k = monthKey(new Date(o.createdAt))
    if (monthSet.has(k)) revenueByMonth[k] += o.totalAmount
  }

  // 商品別売上ランキング + 粗利（現在の Product.purchasePrice を使用）
  const allItems = paidOrders.flatMap(o => o.items)
  const productIds = [...new Set(allItems.map(i => i.productId).filter(Boolean) as string[])]
  const productCosts = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, purchasePrice: true } })
    : []
  const costMap = new Map(productCosts.map(p => [p.id, p.purchasePrice]))

  const productAgg: Record<string, { name: string; revenue: number; quantity: number; cost: number }> = {}
  let totalCost = 0
  for (const it of allItems) {
    const key = it.productName
    if (!productAgg[key]) productAgg[key] = { name: key, revenue: 0, quantity: 0, cost: 0 }
    productAgg[key].revenue += it.subtotal
    productAgg[key].quantity += it.quantity
    const unitCost = (it.productId && costMap.get(it.productId)) || 0
    const lineCost = unitCost * it.quantity
    productAgg[key].cost += lineCost
    totalCost += lineCost
  }
  const productRanking = Object.values(productAgg)
    .map(p => ({ ...p, profit: p.revenue - p.cost }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
  const grossProfit = totalRevenue - totalCost

  // ===== 運用コスト =====
  const costs = await prisma.operatingCost.findMany()
  const costByMonth: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
  const costByCategory: Record<string, number> = {}
  for (const c of costs) {
    if (monthSet.has(c.month)) costByMonth[c.month] += c.amount
    costByCategory[c.category] = (costByCategory[c.category] ?? 0) + c.amount
  }
  const totalOperatingCost = costs.reduce((s, c) => s + c.amount, 0)

  // ===== ユーザー内訳 =====
  const usersByType = await prisma.user.groupBy({ by: ['customerType'], _count: { _all: true } })
  const [userTotal, storeTotal, storeMemberTotal, adminTotal, partnerTotal] = await Promise.all([
    prisma.user.count(),
    prisma.store.count(),
    prisma.storeMember.count(),
    prisma.admin.count(),
    prisma.salesPartner.count(),
  ])
  const newUsers = await prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })
  const newUsersByMonth: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
  for (const u of newUsers) {
    const k = monthKey(new Date(u.createdAt))
    if (monthSet.has(k)) newUsersByMonth[k] += 1
  }

  // ===== 買取品目 =====
  const [purchaseItemTotal, purchaseCategoryTotal] = await Promise.all([
    prisma.purchaseItem.count(),
    prisma.purchaseCategory.count(),
  ])
  const recentPurchaseItems = await prisma.purchaseItem.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, purchasePrice: true, quantity: true } })
  const purchaseItemsByMonth: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
  for (const pi of recentPurchaseItems) {
    const k = monthKey(new Date(pi.createdAt))
    if (monthSet.has(k)) purchaseItemsByMonth[k] += 1
  }

  // ===== アクセスログ =====
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [logToday, log7d, log30d] = await Promise.all([
    prisma.accessLog.count({ where: { createdAt: { gte: today } } }),
    prisma.accessLog.count({ where: { createdAt: { gte: d7 } } }),
    prisma.accessLog.count({ where: { createdAt: { gte: d30 } } }),
  ])
  const logByType = await prisma.accessLog.groupBy({ by: ['userType'], _count: { _all: true }, where: { createdAt: { gte: d30 } } })

  // ===== 発注 =====
  const pendingOrders = await prisma.supplyOrder.count({ where: { status: 'pending', paymentStatus: 'paid' } })

  // ===== その他の運用指標 =====
  const [activeStores, unusedLicenses, usedLicenses, openInquiries, openBugReports] = await Promise.all([
    prisma.store.count({ where: { isActive: true } }),
    prisma.licenseKey.count({ where: { isUsed: false } }),
    prisma.licenseKey.count({ where: { isUsed: true } }),
    prisma.inquiry.count({ where: { status: { not: 'completed' } } }),
    prisma.bugReport.count({ where: { status: { not: 'resolved' } } }),
  ])

  // ===== システムヘルス =====
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [emailFailed, emailPending, errors24h, recordingErrors, blockedLogins, chat24h, line24h] = await Promise.all([
    prisma.emailQueue.count({ where: { status: 'failed' } }),
    prisma.emailQueue.count({ where: { status: 'pending' } }),
    prisma.accessLog.count({ where: { userType: 'error', createdAt: { gte: h24 } } }),
    prisma.dealRecording.count({ where: { status: 'error' } }),
    prisma.loginAttempt.count({ where: { blockedUntil: { gt: now } } }),
    prisma.chatMessage.count({ where: { deletedAt: null, createdAt: { gte: h24 } } }),
    prisma.lineMessage.count({ where: { sentAt: { gte: h24 } } }),
  ])

  return NextResponse.json({
    months,
    revenue: {
      total: totalRevenue,
      grossProfit,
      byMonth: months.map(m => ({ month: m, amount: revenueByMonth[m] })),
      productRanking,
    },
    cost: {
      total: totalOperatingCost,
      byMonth: months.map(m => ({ month: m, amount: costByMonth[m] })),
      byCategory: Object.entries(costByCategory).map(([category, amount]) => ({ category, amount })),
    },
    users: {
      total: userTotal,
      byType: usersByType.map(u => ({ type: u.customerType, count: u._count._all })),
      storeTotal,
      storeMemberTotal,
      adminTotal,
      partnerTotal,
      newByMonth: months.map(m => ({ month: m, count: newUsersByMonth[m] })),
    },
    purchase: {
      itemTotal: purchaseItemTotal,
      categoryTotal: purchaseCategoryTotal,
      byMonth: months.map(m => ({ month: m, count: purchaseItemsByMonth[m] })),
    },
    accessLog: {
      today: logToday,
      last7d: log7d,
      last30d: log30d,
      byType: logByType.map(l => ({ type: l.userType, count: l._count._all })),
    },
    ops: {
      pendingOrders,
      activeStores,
      unusedLicenses,
      usedLicenses,
      openInquiries,
      openBugReports,
    },
    health: {
      emailFailed,
      emailPending,
      errors24h,
      recordingErrors,
      blockedLogins,
      chat24h,
      line24h,
    },
  })
}
