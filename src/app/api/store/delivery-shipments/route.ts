import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreScope } from '@/lib/store-scope'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** JSON文字列の画像URLをパースして返す */
function toClient(s: any) {
  let imageUrls: string[] = []
  try { imageUrls = JSON.parse(s.imageUrls || '[]') } catch { /* ignore */ }
  let trackingImageUrls: string[] = []
  try { trackingImageUrls = JSON.parse(s.trackingImageUrls || '[]') } catch { /* ignore */ }
  return { ...s, imageUrls, trackingImageUrls }
}

/**
 * GET /api/store/delivery-shipments
 * 店舗ユーザー向け: 担当顧客の送付一覧を取得
 *
 * Query params:
 *   status - ステータスでフィルタ
 *   q      - 送付番号 or 顧客名で検索
 *   from   - 送付月の開始 (YYYY-MM)
 *   to     - 送付月の終了 (YYYY-MM)
 *   storeIds - 表示スコープ（運営者配下の複数店舗）
 *
 * 宅配は店舗を直接持たず、顧客（User.storeId）経由で帰属が決まる。
 * shippedCount（受取確認バナー）は表示スコープに関わらずログイン中の店舗ぶんだけ数える。
 * 受取確認できるのは自店舗の送付だけなので、他店舗ぶんを混ぜると押しても何もできない通知になる。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const scope = await resolveStoreScope(sessionUser.id, searchParams.get('storeIds'))

  // Build where clause with AND conditions
  const conditions: any[] = [
    { user: { storeId: scope.isMulti ? { in: scope.storeIds } : sessionUser.id } },
    { status: { not: 'draft' } },
  ]
  if (status) conditions.push({ status })
  if (q) {
    conditions.push({
      OR: [
        { shipmentNumber: { contains: q } },
        { user: { name: { contains: q } } },
      ],
    })
  }
  if (from) conditions.push({ shipmentMonth: { gte: from } })
  if (to) conditions.push({ shipmentMonth: { lte: to } })

  const where = { AND: conditions }

  // 上限なしの全件取得だったので、他の一覧APIと同じ既定300・最大1000にそろえる
  const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '300', 10)))
  const records = await prisma.deliveryShipment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true, name: true, furigana: true, phone: true, email: true,
          storeId: true,
          store: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: [{ shipmentMonth: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  // Count shipped (for notification badge)。受取確認できるのは自店舗ぶんだけなので横断させない
  const shippedCount = await prisma.deliveryShipment.count({
    where: { user: { storeId: sessionUser.id }, status: 'shipped' },
  })

  return NextResponse.json({
    records: records.map(toClient),
    shippedCount,
  })
}
