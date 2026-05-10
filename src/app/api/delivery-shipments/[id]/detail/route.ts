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
 * GET /api/delivery-shipments/[id]/detail
 * 店舗・管理者向け: 送付詳細（顧客・店舗情報付き）を取得
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store' && !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const shipment = await prisma.deliveryShipment.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          furigana: true,
          phone: true,
          email: true,
          address: true,
          store: { select: { id: true, name: true, address: true, phone: true } },
        },
      },
    },
  })

  if (!shipment) {
    return NextResponse.json({ error: '送付記録が見つかりません' }, { status: 404 })
  }

  // Store: verify customer belongs to this store
  if (sessionUser.role === 'store' && shipment.user?.store?.id !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(toClient(shipment))
}
