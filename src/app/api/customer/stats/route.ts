import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { monthlyPurchaseAmount, recentMonthKeys, sumPurchaseAmount } from '@/lib/purchase-aggregation'

/** 顧客ダッシュボード統計: 累計買取金額・回数・月次推移
 *
 * 買取金額の正は案件（Deal.purchaseAmount）。宅配買取（DeliveryShipment）の査定額も
 * 「買い取った金額」に含める。詳細は purchase-aggregation.ts を参照。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = sessionUser.id
  const monthKeys = recentMonthKeys(12)

  const [totals, monthly] = await Promise.all([
    sumPurchaseAmount({ userId }, { userId }),
    monthlyPurchaseAmount(monthKeys, { userId }, { userId }),
  ])

  // 画面は month（1〜12）で軸ラベルを描くので、"YYYY-MM" から月を取り出して返す
  const monthlyStats = monthKeys.map((key) => {
    const [year, month] = key.split('-')
    return { year: Number(year), month: Number(month), amount: monthly[key] ?? 0 }
  })

  return NextResponse.json({
    totalPurchaseAmount: totals.amount,
    purchaseCount: totals.count,
    monthlyStats,
  })
}
