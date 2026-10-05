import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { shapePurchaseItem, PURCHASE_ITEM_SHAPE_SELECT } from '@/lib/purchase-item-shape'
import { fixedPriceBoxDuplicateMessage, isFixedPriceBox } from '@/lib/fixed-price-boxes'
import {
  resolveShipmentAccess, isShipmentContracted, recomputeShipmentAmount, DELIVERY_CONTRACT_LOCKED_MESSAGE,
} from '@/lib/delivery-contract'

/**
 * POST /api/delivery-shipments/[id]/purchase-items
 * 宅配買取の送付に買取品目を追加する（店舗・管理者）。送付の査定金額は品目合計で自動更新。
 * 編集・削除・AI調査は案件の品目と共通の /api/purchase-items/[itemId] を使う。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveShipmentAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  if (await isShipmentContracted(id)) {
    return NextResponse.json({ error: DELIVERY_CONTRACT_LOCKED_MESSAGE }, { status: 409 })
  }

  const body = await request.json()
  const { itemName, category, imageUrls, quantity, purchasePrice, janCode, rakutenData, isAdditionalRequest, notes } = body
  if (!itemName || !category) return NextResponse.json({ error: '品名とカテゴリーは必須です' }, { status: 400 })

  // 定額BOX（1000円ボックス・エコ得BOX）は1回の買取につき1個まで
  if (isFixedPriceBox(itemName)) {
    const already = await prisma.purchaseItem.count({ where: { deliveryShipmentId: id, itemName } })
    if (already > 0) return NextResponse.json({ error: fixedPriceBoxDuplicateMessage(itemName) }, { status: 409 })
  }

  const { item, purchaseAmount } = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseItem.create({
      data: {
        deliveryShipmentId: id,
        itemName,
        category,
        imageUrls: JSON.stringify(imageUrls || []),
        quantity: quantity ?? 1,
        purchasePrice: purchasePrice ?? 0,
        janCode: janCode || null,
        rakutenData: rakutenData ? JSON.stringify(rakutenData) : null,
        isAdditionalRequest: isAdditionalRequest ?? false,
        notes: notes || null,
      },
      select: PURCHASE_ITEM_SHAPE_SELECT,
    })
    return { item: created, purchaseAmount: await recomputeShipmentAmount(tx, id) }
  })

  after(() => recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `宅配の買取品目を登録「${item.itemName}」`, req: request }))
  return NextResponse.json({ item: shapePurchaseItem(item), shipmentAmounts: { purchaseAmount } }, { status: 201 })
}
