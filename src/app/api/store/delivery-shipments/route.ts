import { NextRequest, NextResponse } from 'next/server'
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

  // Build where clause with AND conditions
  const conditions: any[] = [
    { user: { storeId: sessionUser.id } },
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

  const records = await prisma.deliveryShipment.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, furigana: true, phone: true, email: true },
      },
    },
    orderBy: [{ shipmentMonth: 'desc' }, { createdAt: 'desc' }],
  })

  // Count shipped (for notification badge)
  const shippedCount = await prisma.deliveryShipment.count({
    where: { user: { storeId: sessionUser.id }, status: 'shipped' },
  })

  return NextResponse.json({
    records: records.map(toClient),
    shippedCount,
  })
}
