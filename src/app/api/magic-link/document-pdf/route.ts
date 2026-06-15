import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 見積書 / 売買契約書 のPDFをダウンロード配信する。
 * GET /api/magic-link/document-pdf?type=contract|estimate&visitId=...&userId=...
 * - userId が無ければ NextAuth セッションから解決（顧客）。店舗/管理者は全件可。
 * - 保存済みの pdfBase64 を application/pdf として返す。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const visitId = searchParams.get('visitId')
  const type = searchParams.get('type') === 'estimate' ? 'estimate' : 'contract'
  const kind = searchParams.get('kind') === 'invoice' ? 'invoice' : 'sale'
  let userId = searchParams.get('userId')
  let isStaff = false

  if (!userId) {
    const session = await getServerSession(authOptions)
    const su = session?.user as any
    if (su?.role === 'customer') userId = su.id
    else if (su && ['store', 'admin', 'superadmin', 'hr'].includes(su.role)) isStaff = true
  }

  if (!visitId || (!userId && !isStaff)) {
    return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id: visitId },
    select: { userId: true },
  })
  if (!schedule) return NextResponse.json({ error: '見つかりません' }, { status: 404 })
  if (!isStaff && schedule.userId !== userId) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
  }

  let pdfBase64: string | null | undefined
  if (type === 'estimate') {
    const est = await prisma.estimate.findUnique({ where: { visitScheduleId: visitId }, select: { pdfBase64: true, invoicePdfBase64: true } })
    pdfBase64 = kind === 'invoice' ? est?.invoicePdfBase64 : est?.pdfBase64
  } else {
    const c = await prisma.salesContract.findUnique({ where: { visitScheduleId: visitId }, select: { pdfBase64: true, invoicePdfBase64: true } })
    pdfBase64 = kind === 'invoice' ? c?.invoicePdfBase64 : c?.pdfBase64
  }

  if (!pdfBase64) return NextResponse.json({ error: 'PDFが見つかりません' }, { status: 404 })

  const buf = Buffer.from(pdfBase64, 'base64')
  const nameMap: Record<string, string> = {
    'contract-sale': 'sales-contract.pdf',
    'contract-invoice': 'invoice.pdf',
    'estimate-sale': 'estimate.pdf',
    'estimate-invoice': 'estimate-invoice.pdf',
  }
  const filename = nameMap[`${type}-${kind}`] ?? 'document.pdf'
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0',
    },
  })
}
