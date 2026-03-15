import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function verifyAccess(itemId: string, sessionUser: any) {
  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    include: { visitSchedule: { select: { storeId: true } } },
  })
  if (!item) return { error: '品目が見つかりません', status: 404 }
  if (sessionUser.role === 'store' && item.visitSchedule.storeId !== sessionUser.id) {
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
  if (body.imageUrls !== undefined) updateData.imageUrls = JSON.stringify(body.imageUrls)
  if (body.quantity !== undefined) updateData.quantity = body.quantity
  if (body.purchasePrice !== undefined) updateData.purchasePrice = body.purchasePrice

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseItem.update({
      where: { id: itemId },
      data: updateData,
    })

    // purchaseAmount 再計算
    const allItems = await tx.purchaseItem.findMany({ where: { visitScheduleId: result.visitScheduleId } })
    const total = allItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id: result.visitScheduleId }, data: { purchaseAmount: total } })

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

  await prisma.$transaction(async (tx) => {
    await tx.purchaseItem.delete({ where: { id: itemId } })

    // purchaseAmount 再計算
    const allItems = await tx.purchaseItem.findMany({ where: { visitScheduleId } })
    const total = allItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id: visitScheduleId }, data: { purchaseAmount: total } })
  })

  return NextResponse.json({ deleted: true })
}
