import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'
import { recomputeDealAmounts } from '@/lib/deal-amounts'

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
            select: { id: true, workName: true, unitPrice: true, quantity: true, notes: true },
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
      // 案件直下の品目・書類（再ペアレント後の正）
      purchaseItems: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, itemName: true, category: true, quantity: true, purchasePrice: true,
          imageUrls: true, janCode: true, rakutenData: true, aiResearch: true, aiResearchedAt: true,
          isAdditionalRequest: true, notes: true,
          inventoryItem: { select: { id: true } },
        },
      },
      workItems: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, workName: true, unitPrice: true, quantity: true, notes: true },
      },
      salesContract: {
        select: { id: true, visitScheduleId: true, agreedAt: true, emailSentAt: true, customerEmail: true, pdfBase64: true, invoicePdfBase64: true },
      },
      estimate: {
        select: { id: true, visitScheduleId: true, validUntil: true, purchaseAmount: true, billingAmount: true, emailSentAt: true, customerEmail: true, pdfBase64: true, invoicePdfBase64: true },
      },
    },
  })

  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // PDF本体・署名base64は返さず有無のbooleanへ。案件直下の書類も同様に整形。
  const { preConsentSignature, salesContract: dealContract, estimate: dealEstimate, ...dealRest } = deal
  const shapeContract = (c: typeof dealContract) => c ? {
    id: c.id, visitScheduleId: c.visitScheduleId, agreedAt: c.agreedAt, emailSentAt: c.emailSentAt, customerEmail: c.customerEmail,
    hasPdf: !!c.pdfBase64, hasInvoicePdf: !!c.invoicePdfBase64,
  } : null
  const shapeEstimate = (e: typeof dealEstimate) => e ? {
    id: e.id, visitScheduleId: e.visitScheduleId, validUntil: e.validUntil, purchaseAmount: e.purchaseAmount, billingAmount: e.billingAmount,
    emailSentAt: e.emailSentAt, customerEmail: e.customerEmail, hasPdf: !!e.pdfBase64, hasInvoicePdf: !!e.invoicePdfBase64,
  } : null
  // 案件直下の買取品目: 画像をプロキシURL化・JSONをパース（訪問詳細と同等のフォーム用）
  const dealPurchaseItems = deal.purchaseItems.map((item) => {
    let images: string[] = []
    try { images = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }
    let rakutenData: any = null
    if (item.rakutenData) { try { rakutenData = JSON.parse(item.rakutenData) } catch { /* ignore */ } }
    let aiResearch: any = null
    if (item.aiResearch) { try { aiResearch = JSON.parse(item.aiResearch) } catch { /* ignore */ } }
    return {
      id: item.id, itemName: item.itemName, category: item.category, quantity: item.quantity, purchasePrice: item.purchasePrice,
      imageUrls: images.map((_: string, idx: number) => `/api/purchase-items/${item.id}/images/${idx}`),
      janCode: item.janCode, rakutenData, aiResearch, aiResearchedAt: item.aiResearchedAt,
      isAdditionalRequest: item.isAdditionalRequest, notes: item.notes,
      convertedInventoryId: item.inventoryItem?.id ?? null,
    }
  })
  // 紙契約書写真: 保存URLはプロキシURLに変換して返す
  let paperImages: string[] = []
  try { const a = JSON.parse(deal.paperContractImages || '[]'); if (Array.isArray(a)) paperImages = a } catch { /* ignore */ }
  const shaped = {
    ...dealRest,
    purchaseItems: dealPurchaseItems,
    hasPreConsent: !!preConsentSignature,
    paperContractImages: paperImages.map((_: string, idx: number) => `/api/deals/${deal.id}/contract-images/${idx}`),
    dealContract: shapeContract(dealContract),
    dealEstimate: shapeEstimate(dealEstimate),
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
  const { detail, status, storeId, occurredAt, preConsentSignature, purchaseUpliftPercent } = body

  if (status !== undefined && !isDealStatus(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }
  if (purchaseUpliftPercent !== undefined && ![0, 10, 15].includes(Number(purchaseUpliftPercent))) {
    return NextResponse.json({ error: '無効な上乗せ率です' }, { status: 400 })
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
  // 案件発生日（管理・店舗とも編集可）。不正値は無視。
  if (occurredAt !== undefined) {
    const d = new Date(occurredAt)
    if (!isNaN(d.getTime())) updateData.occurredAt = d
  }
  // 事前同意の署名（案件単位）。空文字/null でクリア可。
  if (preConsentSignature !== undefined) {
    updateData.preConsentSignature = preConsentSignature || null
    updateData.preConsentAt = preConsentSignature ? new Date() : null
  }
  // 買取金額の上乗せ率（0/10/15%）
  if (purchaseUpliftPercent !== undefined) updateData.purchaseUpliftPercent = Number(purchaseUpliftPercent)

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

  // 上乗せ率が変わったら買取合計（purchaseAmount）を再計算
  if (purchaseUpliftPercent !== undefined) {
    try { await recomputeDealAmounts(prisma, id) } catch (e) { console.error('[Deal] 上乗せ再計算に失敗:', e) }
  }

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

  // 全訪問は必ず案件に属する不変条件を守るため、訪問が紐づく案件は削除不可。
  // （削除で dealId を null 化すると訪問が再び孤立し、契約書/見積が案件から辿れなくなる）
  const linkedVisits = await prisma.visitSchedule.count({ where: { dealId: id } })
  if (linkedVisits > 0) {
    return NextResponse.json(
      { error: `訪問予定が紐づく案件は削除できません（紐づく訪問: ${linkedVisits}件）。先に訪問予定を削除または別案件へ付け替えてください。` },
      { status: 400 },
    )
  }
  await prisma.deal.delete({ where: { id } })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `案件を削除`, req: request })
  return NextResponse.json({ success: true })
}
