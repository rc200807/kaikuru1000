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
          // 売買契約書の記載事項（生年月日・職業）
          birthDate: true,
          idBirthDate: true,
          occupation: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          // 売買契約書に記載する古物営業許可番号（店舗の値は運営者から継承される）
          antiquePermitNumber: true,
          operator: { select: { antiquePermitNumber: true } },
        },
      },
      deal: { select: { purchaseUpliftPercent: true } },
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
  const [purchaseItems, workItems, salesContract, pdfCount, invoicePdfCount] = await Promise.all([
    // 画面が使うのは品名・数量・金額だけ。select 無しだと rakutenData（楽天APIの生JSON）や
    // notes まで全行ぶん引いてしまう
    prisma.purchaseItem.findMany({
      where: itemWhere, orderBy: { createdAt: 'asc' },
      select: { id: true, itemName: true, category: true, quantity: true, purchasePrice: true },
    }),
    prisma.workItem.findMany({
      where: itemWhere, orderBy: { createdAt: 'asc' },
      select: { id: true, workName: true, unitPrice: true, quantity: true },
    }),
    prisma.salesContract.findUnique({ where: docWhere, select: { id: true, agreedAt: true, signatureData: true } }),
    // PDFは数MBの base64。「入っているか」だけが必要なので本文は引かず count で判定する
    prisma.salesContract.count({ where: { ...docWhere, NOT: { pdfBase64: null } } }),
    prisma.salesContract.count({ where: { ...docWhere, NOT: { invoicePdfBase64: null } } }),
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
    purchaseUpliftPercent: schedule.deal?.purchaseUpliftPercent ?? 0,
    user: {
      ...schedule.user,
      // 生年月日は顧客プロフィールが正。未登録なら身分証OCRの値を使う
      birthDate: schedule.user.birthDate || schedule.user.idBirthDate,
    },
    store: {
      id: schedule.store.id,
      name: schedule.store.name,
      address: schedule.store.address,
      phone: schedule.store.phone,
      antiquePermitNumber: schedule.store.antiquePermitNumber || schedule.store.operator?.antiquePermitNumber || null,
    },
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
    hasPdf: pdfCount > 0,
    hasInvoicePdf: invoicePdfCount > 0,
    createdAt: schedule.createdAt,
  })
}
