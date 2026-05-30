import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 店舗の買取品目一覧（自店舗の訪問に紐づく PurchaseItem を横断取得）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const { searchParams } = new URL(request.url)
  const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '300', 10)))

  const items = await prisma.purchaseItem.findMany({
    where: { visitSchedule: { storeId } },
    include: {
      visitSchedule: {
        select: {
          id: true,
          visitDate: true,
          status: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const mapped = items.map((it) => {
    let imageCount = 0
    try {
      const arr = JSON.parse(it.imageUrls || '[]')
      if (Array.isArray(arr)) imageCount = arr.length
    } catch {
      /* ignore */
    }
    return {
      id: it.id,
      itemName: it.itemName,
      category: it.category,
      quantity: it.quantity,
      purchasePrice: it.purchasePrice,
      janCode: it.janCode,
      createdAt: it.createdAt,
      // 画像は認証付きプロキシ経由で配信（外部Blob URLは直接返さない）
      images: Array.from({ length: imageCount }, (_, idx) => `/api/purchase-items/${it.id}/images/${idx}`),
      visitSchedule: it.visitSchedule,
    }
  })

  return NextResponse.json({ items: mapped })
}
