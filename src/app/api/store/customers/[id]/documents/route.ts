import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 顧客に紐づく発行済み書類（見積書・売買契約書）の一覧を返す。
 * PDF本体（base64）は転送せず、各書類のPDF有無フラグのみ返す。
 * 実PDFのダウンロードは /api/magic-link/document-pdf（店舗セッションで取得可）を使う。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id as string
  const { id: userId } = await params

  // この店舗に紐付く顧客であることを確認
  const customer = await prisma.user.findFirst({
    where: { id: userId, storeId },
    select: { id: true },
  })
  if (!customer) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  // 自店舗・この顧客の訪問スケジュールに紐づく見積/契約
  const schedules = await prisma.visitSchedule.findMany({
    where: { userId, storeId },
    select: {
      id: true,
      visitDate: true,
      estimate: { select: { id: true, createdAt: true, validUntil: true, emailSentAt: true, purchaseAmount: true, billingAmount: true } },
      salesContract: { select: { id: true, createdAt: true, emailSentAt: true } },
    },
    orderBy: { visitDate: 'desc' },
  })

  const estIds = schedules.map(s => s.estimate?.id).filter((x): x is string => !!x)
  const conIds = schedules.map(s => s.salesContract?.id).filter((x): x is string => !!x)

  // base64本体は読まず「PDFが存在するか」だけを軽量に判定
  const [estSaleRows, estInvRows, conSaleRows, conInvRows] = await Promise.all([
    estIds.length ? prisma.estimate.findMany({ where: { id: { in: estIds }, pdfBase64: { not: null } }, select: { id: true } }) : Promise.resolve([]),
    estIds.length ? prisma.estimate.findMany({ where: { id: { in: estIds }, invoicePdfBase64: { not: null } }, select: { id: true } }) : Promise.resolve([]),
    conIds.length ? prisma.salesContract.findMany({ where: { id: { in: conIds }, pdfBase64: { not: null } }, select: { id: true } }) : Promise.resolve([]),
    conIds.length ? prisma.salesContract.findMany({ where: { id: { in: conIds }, invoicePdfBase64: { not: null } }, select: { id: true } }) : Promise.resolve([]),
  ])
  const estSale = new Set(estSaleRows.map(r => r.id))
  const estInv = new Set(estInvRows.map(r => r.id))
  const conSale = new Set(conSaleRows.map(r => r.id))
  const conInv = new Set(conInvRows.map(r => r.id))

  const documents = schedules
    .map(s => ({
      scheduleId: s.id,
      visitDate: s.visitDate,
      estimate: s.estimate
        ? {
            createdAt: s.estimate.createdAt,
            validUntil: s.estimate.validUntil,
            emailSentAt: s.estimate.emailSentAt,
            purchaseAmount: s.estimate.purchaseAmount,
            billingAmount: s.estimate.billingAmount,
            hasSale: estSale.has(s.estimate.id),
            hasInvoice: estInv.has(s.estimate.id),
          }
        : null,
      contract: s.salesContract
        ? {
            createdAt: s.salesContract.createdAt,
            emailSentAt: s.salesContract.emailSentAt,
            hasSale: conSale.has(s.salesContract.id),
            hasInvoice: conInv.has(s.salesContract.id),
          }
        : null,
    }))
    .filter(d => d.estimate || d.contract)

  return NextResponse.json({ documents })
}
