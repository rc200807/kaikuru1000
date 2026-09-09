import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deliveryShipmentAvailability } from '@/lib/request-interval'

/**
 * GET /api/delivery-shipments/availability
 * 顧客: 次回いつから送付登録できるかを返す（既定は3ヶ月に1回）。
 * 一覧APIは配列を返す既存の形を崩さないため、可否は別エンドポイントで返す。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await deliveryShipmentAvailability(sessionUser.id))
}
