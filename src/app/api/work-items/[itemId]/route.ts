import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function verifyAccess(itemId: string, sessionUser: any) {
  const item = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: { visitSchedule: { select: { storeId: true } } },
  })
  if (!item) return { error: '作業品目が見つかりません', status: 404 }
  if (sessionUser.role === 'store' && item.visitSchedule.storeId !== sessionUser.id) {
    return { error: 'Forbidden', status: 403 }
  }
  return { item }
}

/** 作業品目を更新 */
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

  if (body.workName !== undefined) updateData.workName = body.workName
  if (body.unitPrice !== undefined) updateData.unitPrice = body.unitPrice
  if (body.quantity !== undefined) updateData.quantity = body.quantity

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workItem.update({
      where: { id: itemId },
      data: updateData,
    })

    // billingAmount 再計算
    const allItems = await tx.workItem.findMany({ where: { visitScheduleId: result.visitScheduleId } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id: result.visitScheduleId }, data: { billingAmount: total } })

    return result
  })

  return NextResponse.json(updated)
}

/** 作業品目を削除 */
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
    await tx.workItem.delete({ where: { id: itemId } })

    // billingAmount 再計算
    const allItems = await tx.workItem.findMany({ where: { visitScheduleId } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id: visitScheduleId }, data: { billingAmount: total } })
  })

  return NextResponse.json({ deleted: true })
}
