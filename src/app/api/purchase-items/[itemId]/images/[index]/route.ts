import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PURCHASE_ITEM_OWNER_SELECT, storeOwnsPurchaseItem, customerOwnsPurchaseItem,
} from '@/lib/purchase-item-access'
import { serveImageFromBlob } from '@/lib/image-proxy'

/**
 * 買取品目画像を認証プロキシ経由で配信
 * GET /api/purchase-items/[itemId]/images/[index]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string; index: string }> },
) {
  const { itemId, index: indexStr } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { imageUrls: true, ...PURCHASE_ITEM_OWNER_SELECT },
  })
  if (!item) return NextResponse.json({ error: '品目が見つかりません' }, { status: 404 })

  // 認可チェック（所有者は案件・訪問の両方から判定する）
  if (sessionUser.role === 'customer') {
    if (!customerOwnsPurchaseItem(item, sessionUser.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (sessionUser.role === 'store') {
    if (!storeOwnsPurchaseItem(item, sessionUser.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて閲覧可

  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }

  const index = parseInt(indexStr, 10)
  if (isNaN(index) || index < 0 || index >= blobUrls.length) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  const blobUrl = blobUrls[index]

  // ?thumb=1 ならサムネを返す（無ければ本体にフォールバック）
  return serveImageFromBlob(request, blobUrl)
}
