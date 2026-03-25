import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** マジックリンク経由で契約データを取得する（セッション不要） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const visitId = searchParams.get('visitId')
  const userId = searchParams.get('userId')

  if (!visitId || !userId) {
    return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id: visitId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          email: true,
          idAddress: true,
          idName: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      purchaseItems: { orderBy: { createdAt: 'asc' } },
      workItems: { orderBy: { createdAt: 'asc' } },
      salesContract: {
        select: {
          id: true,
          agreedAt: true,
          signatureData: true,
        },
      },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: '契約データが見つかりません' }, { status: 404 })
  }

  // Validate the userId matches the visit schedule's user
  if (schedule.userId !== userId) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
  }

  return NextResponse.json({
    id: schedule.id,
    visitDate: schedule.visitDate,
    status: schedule.status,
    purchaseAmount: schedule.purchaseAmount,
    billingAmount: schedule.billingAmount,
    staffName: schedule.staffName,
    user: schedule.user,
    store: schedule.store,
    purchaseItems: schedule.purchaseItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
    })),
    workItems: schedule.workItems.map((item) => ({
      id: item.id,
      workName: item.workName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    salesContract: schedule.salesContract,
    createdAt: schedule.createdAt,
  })
}
