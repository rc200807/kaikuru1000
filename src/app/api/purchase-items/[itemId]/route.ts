import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recomputeDealAmounts } from '@/lib/deal-amounts'
import { PURCHASE_ITEM_OWNER_SELECT, storeOwnsPurchaseItem } from '@/lib/purchase-item-access'
import { resolveEditedImageUrls } from '@/lib/image-url'

async function verifyAccess(itemId: string, sessionUser: any) {
  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { id: true, dealId: true, visitScheduleId: true, imageUrls: true, ...PURCHASE_ITEM_OWNER_SELECT },
  })
  if (!item) return { error: '品目が見つかりません', status: 404 }
  if (sessionUser.role === 'store' && !storeOwnsPurchaseItem(item, sessionUser.id)) {
    return { error: 'Forbidden', status: 403 }
  }
  return { item }
}

/** 買取品目を更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const access = await verifyAccess(itemId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json()
  const updateData: any = {}

  if (body.itemName !== undefined) updateData.itemName = body.itemName
  if (body.category !== undefined) updateData.category = body.category
  if (body.imageUrls !== undefined) {
    // 編集フォームは既存画像を認証プロキシURL（/api/purchase-items/{id}/images/{index}）のまま
    // 保持して送り返してくる。そのままDBに書くと次回アクセス時に自分自身へリダイレクトし続けて
    // 画像が壊れるため、現在の実URLに解決してから保存する
    let current: string[] = []
    try { current = JSON.parse(access.item!.imageUrls || '[]') } catch { /* ignore */ }
    updateData.imageUrls = JSON.stringify(
      resolveEditedImageUrls(current, body.imageUrls, `/api/purchase-items/${itemId}/images`),
    )
  }
  if (body.quantity !== undefined) updateData.quantity = body.quantity
  if (body.purchasePrice !== undefined) updateData.purchasePrice = body.purchasePrice
  if (body.janCode !== undefined) updateData.janCode = body.janCode || null
  if (body.rakutenData !== undefined) updateData.rakutenData = body.rakutenData ? JSON.stringify(body.rakutenData) : null
  if (body.isAdditionalRequest !== undefined) updateData.isAdditionalRequest = !!body.isAdditionalRequest
  if (body.notes !== undefined) updateData.notes = body.notes || null

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseItem.update({
      where: { id: itemId },
      data: updateData,
    })

    // 案件合計を再計算（正）。訪問合計も後方互換で維持。
    if (result.dealId) await recomputeDealAmounts(tx, result.dealId)
    if (result.visitScheduleId) {
      const allItems = await tx.purchaseItem.findMany({ where: { visitScheduleId: result.visitScheduleId } })
      const total = allItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0)
      await tx.visitSchedule.update({ where: { id: result.visitScheduleId }, data: { purchaseAmount: total } })
    }

    return result
  })

  return NextResponse.json(updated)
}

/** 買取品目を削除 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const access = await verifyAccess(itemId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const visitScheduleId = access.item!.visitScheduleId
  const dealId = access.item!.dealId

  await prisma.$transaction(async (tx) => {
    await tx.purchaseItem.delete({ where: { id: itemId } })

    // 案件合計を再計算（正）。訪問合計も後方互換で維持。
    if (dealId) await recomputeDealAmounts(tx, dealId)
    if (visitScheduleId) {
      const allItems = await tx.purchaseItem.findMany({ where: { visitScheduleId } })
      const total = allItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0)
      await tx.visitSchedule.update({ where: { id: visitScheduleId }, data: { purchaseAmount: total } })
    }
  })

  return NextResponse.json({ deleted: true })
}
