import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 見積データを取得する（NextAuthセッション or userIdパラメータ）。顧客向け閲覧用。 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const visitId = searchParams.get('visitId')
  let userId = searchParams.get('userId')

  if (!userId) {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as any
    if (sessionUser?.role === 'customer') userId = sessionUser.id
  }

  if (!visitId || !userId) {
    return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id: visitId },
    include: {
      user: { select: { id: true, name: true, phone: true, address: true, email: true, idAddress: true, idName: true } },
      store: { select: { id: true, name: true, address: true, phone: true } },
      deal: { select: { purchaseUpliftPercent: true } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: '見積データが見つかりません' }, { status: 404 })
  }
  if (schedule.userId !== userId) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
  }

  // 品目・見積は「案件」を正とする（再ペアレント後）。dealId 基準で取得し、無ければ従来の訪問基準。
  const docWhere = schedule.dealId ? { dealId: schedule.dealId } : { visitScheduleId: visitId }
  const [purchaseItems, workItems, estimate] = await Promise.all([
    prisma.purchaseItem.findMany({ where: docWhere, orderBy: { createdAt: 'asc' } }),
    prisma.workItem.findMany({ where: docWhere, orderBy: { createdAt: 'asc' } }),
    prisma.estimate.findUnique({ where: docWhere, select: { id: true, validUntil: true, staffName: true, purchaseAmount: true, billingAmount: true, pdfBase64: true, invoicePdfBase64: true, createdAt: true } }),
  ])

  if (!estimate) {
    return NextResponse.json({ error: '見積書が見つかりません' }, { status: 404 })
  }

  return NextResponse.json({
    id: schedule.id,
    user: schedule.user,
    store: schedule.store,
    purchaseUpliftPercent: schedule.deal?.purchaseUpliftPercent ?? 0,
    estimate: {
      id: estimate.id,
      validUntil: estimate.validUntil,
      staffName: estimate.staffName,
      purchaseAmount: estimate.purchaseAmount,
      billingAmount: estimate.billingAmount,
      createdAt: estimate.createdAt,
    },
    hasPdf: !!estimate.pdfBase64,
    hasInvoicePdf: !!estimate.invoicePdfBase64,
    purchaseItems: purchaseItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
    })),
    workItems: workItems.map((item) => ({
      id: item.id,
      workName: item.workName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  })
}
