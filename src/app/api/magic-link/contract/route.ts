import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 契約データを取得する（NextAuthセッション or userIdパラメータ） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const visitId = searchParams.get('visitId')
  let userId = searchParams.get('userId')

  // NextAuthセッションがあればそこからuserIdを取得
  if (!userId) {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as any
    if (sessionUser?.role === 'customer') {
      userId = sessionUser.id
    }
  }

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
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: '契約データが見つかりません' }, { status: 404 })
  }

  // Validate the userId matches the visit schedule's user
  if (schedule.userId !== userId) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
  }

  // 品目・契約は「案件」を正とする（再ペアレント後）。dealId 基準で取得し、無ければ従来の訪問基準。
  const docWhere = schedule.dealId ? { dealId: schedule.dealId } : { visitScheduleId: visitId }
  const itemWhere = schedule.dealId ? { dealId: schedule.dealId } : { visitScheduleId: visitId }
  const [purchaseItems, workItems, salesContract] = await Promise.all([
    prisma.purchaseItem.findMany({ where: itemWhere, orderBy: { createdAt: 'asc' } }),
    prisma.workItem.findMany({ where: itemWhere, orderBy: { createdAt: 'asc' } }),
    prisma.salesContract.findUnique({ where: docWhere, select: { id: true, agreedAt: true, signatureData: true, pdfBase64: true, invoicePdfBase64: true } }),
  ])
  const purchaseAmount = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const billingAmount = workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  return NextResponse.json({
    id: schedule.id,
    visitDate: schedule.visitDate,
    status: schedule.status,
    purchaseAmount,
    billingAmount,
    staffName: schedule.staffName,
    user: schedule.user,
    store: schedule.store,
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
    salesContract: salesContract
      ? { id: salesContract.id, agreedAt: salesContract.agreedAt, signatureData: salesContract.signatureData }
      : null,
    hasPdf: !!salesContract?.pdfBase64,
    hasInvoicePdf: !!salesContract?.invoicePdfBase64,
    createdAt: schedule.createdAt,
  })
}
