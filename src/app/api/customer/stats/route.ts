import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 顧客ダッシュボード統計: 累計買取金額・回数・月次推移 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = sessionUser.id

  // 完了済み訪問スケジュールを全件取得
  const completedVisits = await prisma.visitSchedule.findMany({
    where: {
      userId,
      status: 'completed',
      purchaseAmount: { not: null },
    },
    select: {
      purchaseAmount: true,
      visitDate: true,
    },
    orderBy: { visitDate: 'asc' },
  })

  const totalPurchaseAmount = completedVisits.reduce(
    (sum, v) => sum + (v.purchaseAmount ?? 0), 0
  )
  const purchaseCount = completedVisits.length

  // 月次集計（過去12ヶ月）
  const monthlyMap: Record<string, { amount: number; count: number }> = {}

  // 過去12ヶ月のキーを生成（ゼロ埋め用）
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = { amount: 0, count: 0 }
  }

  for (const v of completedVisits) {
    const d = new Date(v.visitDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].amount += v.purchaseAmount ?? 0
      monthlyMap[key].count += 1
    }
  }

  const monthlyStats = Object.entries(monthlyMap).map(([month, data]) => ({
    month,
    amount: data.amount,
    count: data.count,
  }))

  return NextResponse.json({ totalPurchaseAmount, purchaseCount, monthlyStats })
}
