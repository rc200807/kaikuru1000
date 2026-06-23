import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

function resolveAccess(session: any) {
  const sessionUser = session?.user as any
  const isStore = sessionUser?.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser?.role)
  return { sessionUser, isStore, isAdmin }
}

// 案件詳細
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isStore, isAdmin } = resolveAccess(session)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, furigana: true, email: true, phone: true, address: true, customerType: true } },
      store: {
        select: {
          id: true, name: true, code: true, phone: true, address: true,
          prefecture: true, email: true, invoiceNumber: true, antiquePermitNumber: true,
        },
      },
      inquiry: { select: { id: true, inquiryType: true, details: true, createdAt: true } },
      visitSchedules: {
        orderBy: { visitDate: 'desc' },
        select: {
          id: true, visitDate: true, startTime: true, endTime: true, status: true, note: true,
          staffName: true, purchaseAmount: true, billingAmount: true,
          purchaseItems: {
            select: { id: true, itemName: true, category: true, quantity: true, purchasePrice: true },
          },
          workItems: {
            select: { id: true, workName: true, unitPrice: true, quantity: true },
          },
          salesContract: {
            select: {
              id: true, agreedAt: true, emailSentAt: true, customerEmail: true,
              pdfBase64: true, invoicePdfBase64: true,
            },
          },
          estimate: {
            select: {
              id: true, validUntil: true, purchaseAmount: true, billingAmount: true,
              emailSentAt: true, customerEmail: true, pdfBase64: true, invoicePdfBase64: true,
            },
          },
        },
      },
    },
  })

  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // PDF本体（base64）は返さず、有無のbooleanへ変換してペイロードを軽量化
  const shaped = {
    ...deal,
    visitSchedules: deal.visitSchedules.map(vs => ({
      ...vs,
      salesContract: vs.salesContract
        ? {
            id: vs.salesContract.id,
            agreedAt: vs.salesContract.agreedAt,
            emailSentAt: vs.salesContract.emailSentAt,
            customerEmail: vs.salesContract.customerEmail,
            hasPdf: !!vs.salesContract.pdfBase64,
            hasInvoicePdf: !!vs.salesContract.invoicePdfBase64,
          }
        : null,
      estimate: vs.estimate
        ? {
            id: vs.estimate.id,
            validUntil: vs.estimate.validUntil,
            purchaseAmount: vs.estimate.purchaseAmount,
            billingAmount: vs.estimate.billingAmount,
            emailSentAt: vs.estimate.emailSentAt,
            customerEmail: vs.estimate.customerEmail,
            hasPdf: !!vs.estimate.pdfBase64,
            hasInvoicePdf: !!vs.estimate.invoicePdfBase64,
          }
        : null,
    })),
  }

  return NextResponse.json(shaped)
}

// 案件更新（detail / status / storeId）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isStore, isAdmin } = resolveAccess(session)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { detail, status, storeId } = body

  if (status !== undefined && !isDealStatus(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }

  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updateData: any = {}
  if (detail !== undefined) updateData.detail = detail || null
  if (status !== undefined) updateData.status = status
  // 担当店舗の変更は管理者のみ
  if (storeId !== undefined && isAdmin) updateData.storeId = storeId || null

  const updated = await prisma.deal.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, customerType: true } },
      store: { select: { id: true, name: true, code: true } },
      inquiry: { select: { id: true, inquiryType: true } },
      _count: { select: { visitSchedules: true } },
    },
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `案件を更新`, req: request })
  return NextResponse.json(updated)
}

// 案件の物理削除（管理者のみ。紐づく訪問予定は削除せずリンク解除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isAdmin } = resolveAccess(session)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })

  // 訪問予定は削除せずリンクのみ解除（FKの SET NULL と二重防御）
  await prisma.visitSchedule.updateMany({ where: { dealId: id }, data: { dealId: null } })
  await prisma.deal.delete({ where: { id } })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `案件を削除`, req: request })
  return NextResponse.json({ success: true })
}
