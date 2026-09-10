import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDealNumber } from '@/lib/deal-number-server'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'
import { isDealCategory } from '@/lib/deal-categories'
import { recomputeDealAmounts } from '@/lib/deal-amounts'
import { deleteDealCascade } from '@/lib/delete-customer'
import { isDealContracted, DEAL_LOCKED_MESSAGE } from '@/lib/deal-lock'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import { storeSupportsAkikuru } from '@/lib/store-services'
import { createTimer } from '@/lib/api-timing'

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
  const t = createTimer()

  // 書類PDF・署名は `@db.Text` の巨大な base64。用途は「入っているか」の真偽値だけなので、
  // 本文は select せず、別クエリで「入っている行のID」だけを引いて Set で判定する。
  // PostgreSQL は大きな TEXT を TOAST に外出しするため、IS NOT NULL は行ヘッダの
  // null ビットマップだけで答えられ、base64 の実体は1バイトも読まれない。
  // （以前は訪問3件の案件で 17 カラムぶんの base64 が DB→関数 を流れて `!!` に潰されていた）
  // 同型の対処は visit-schedules/[id]/contract/route.ts と store-customer-overview.ts にもある。
  //
  // なお付随クエリは下の 403 判定より前に走るが、dealId でしか絞っておらず
  // 403 のときは結果を捨てるだけなので情報は漏れない。
  const docWhere = { OR: [{ dealId: id }, { visitSchedule: { dealId: id } }] }
  const idSet = (rows: { id: string }[]) => new Set(rows.map(r => r.id))

  const [deal, conPdfRows, conInvRows, estPdfRows, estInvRows, preConsentRow] = await Promise.all([
    t.measure('deal', () => prisma.deal.findUnique({
    where: { id },
    select: {
      // Deal のスカラーは明示列挙する。include にすると preConsentSignature（署名画像の base64）
      // まで毎回引いてしまい、用途は hasPreConsent の真偽値だけなので丸ごと無駄になる
      id: true, dealNumber: true, userId: true, storeId: true, inquiryId: true,
      detail: true, status: true, category: true, occurredAt: true,
      createdByType: true, createdById: true, createdByName: true, memberId: true,
      purchaseAmount: true, billingAmount: true, purchaseUpliftPercent: true,
      preConsentAt: true, paperContractImages: true, paperContractAgreedAt: true,
      createdAt: true, updatedAt: true,
      user: {
        select: {
          id: true, name: true, furigana: true, email: true, phone: true, address: true, customerType: true,
          // 顧客情報セクションに出す属性（生年月日は身分証OCR由来、職業は売買契約書作成時に取得）
          birthDate: true, idBirthDate: true, idDocumentType: true, occupation: true,
        },
      },
      store: {
        select: {
          id: true, name: true, code: true, phone: true, address: true,
          prefecture: true, email: true, invoiceNumber: true, antiquePermitNumber: true,
          supportedServices: true,
        },
      },
      inquiry: { select: { id: true, inquiryType: true, details: true, createdAt: true } },
      // 案件の担当メンバー（一覧の「担当」列・一括担当変更と同じ正の値）
      member: { select: { id: true, name: true } },
      visitSchedules: {
        orderBy: { visitDate: 'desc' },
        select: {
          id: true, visitDate: true, startTime: true, endTime: true, status: true, note: true,
          staffName: true, purchaseAmount: true, billingAmount: true,
          // 訪問目的（管理ポータルのマスタから選択）
          purposeId: true, purposeName: true,
          // 後日引取（売買契約書の作成時に登録される。訪問行そのものに持つ設計）
          // revisitPending は「日時未定でも後日引取あり」を表すフラグ
          revisitDate: true, revisitStart: true, revisitEnd: true, revisitNote: true, revisitPending: true,
          purchaseItems: {
            select: { id: true, itemName: true, category: true, quantity: true, purchasePrice: true },
          },
          workItems: {
            select: { id: true, workName: true, unitPrice: true, quantity: true, notes: true },
          },
          salesContract: {
            select: { id: true, agreedAt: true, emailSentAt: true, customerEmail: true },
          },
          estimate: {
            select: {
              id: true, validUntil: true, purchaseAmount: true, billingAmount: true,
              emailSentAt: true, customerEmail: true,
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
        select: { id: true, visitScheduleId: true, agreedAt: true, emailSentAt: true, customerEmail: true },
      },
      estimate: {
        select: { id: true, visitScheduleId: true, validUntil: true, purchaseAmount: true, billingAmount: true, emailSentAt: true, customerEmail: true },
      },
    },
    })),
    t.measure('hasdoc', () => prisma.salesContract.findMany({ where: { ...docWhere, NOT: { pdfBase64: null } },        select: { id: true } })),
    t.measure('hasdoc', () => prisma.salesContract.findMany({ where: { ...docWhere, NOT: { invoicePdfBase64: null } }, select: { id: true } })),
    t.measure('hasdoc', () => prisma.estimate.findMany({      where: { ...docWhere, NOT: { pdfBase64: null } },        select: { id: true } })),
    t.measure('hasdoc', () => prisma.estimate.findMany({      where: { ...docWhere, NOT: { invoicePdfBase64: null } }, select: { id: true } })),
    t.measure('hasdoc', () => prisma.deal.findFirst({ where: { id, NOT: { preConsentSignature: null } }, select: { id: true } })),
  ])

  const contractHasPdf = idSet(conPdfRows)
  const contractHasInvoice = idSet(conInvRows)
  const estimateHasPdf = idSet(estPdfRows)
  const estimateHasInvoice = idSet(estInvRows)

  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 未採番の案件（トランザクション内で作られた訪問由来など）はここで案件番号を付ける
  const dealNumber = deal.dealNumber ?? (await ensureDealNumber(deal.id))

  // 書類は「本文の有無」だけを boolean にして返す（本文は上の存在判定クエリで引いてある）
  const { salesContract: dealContract, estimate: dealEstimate, ...dealRest } = deal
  const shapeContract = (c: typeof dealContract) => c ? {
    id: c.id, visitScheduleId: c.visitScheduleId, agreedAt: c.agreedAt, emailSentAt: c.emailSentAt, customerEmail: c.customerEmail,
    hasPdf: contractHasPdf.has(c.id), hasInvoicePdf: contractHasInvoice.has(c.id),
  } : null
  const shapeEstimate = (e: typeof dealEstimate) => e ? {
    id: e.id, visitScheduleId: e.visitScheduleId, validUntil: e.validUntil, purchaseAmount: e.purchaseAmount, billingAmount: e.billingAmount,
    emailSentAt: e.emailSentAt, customerEmail: e.customerEmail, hasPdf: estimateHasPdf.has(e.id), hasInvoicePdf: estimateHasInvoice.has(e.id),
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
    dealNumber,
    purchaseItems: dealPurchaseItems,
    hasPreConsent: !!preConsentRow,
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
            hasPdf: contractHasPdf.has(vs.salesContract.id),
            hasInvoicePdf: contractHasInvoice.has(vs.salesContract.id),
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
            hasPdf: estimateHasPdf.has(vs.estimate.id),
            hasInvoicePdf: estimateHasInvoice.has(vs.estimate.id),
          }
        : null,
    })),
  }

  return t.json(shaped)
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
  const { detail, status, storeId, occurredAt, preConsentSignature, purchaseUpliftPercent, category, paperContractAgreedAt } = body

  if (status !== undefined && !isDealStatus(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }
  if (category !== undefined && !isDealCategory(category)) {
    return NextResponse.json({ error: '無効なカテゴリーです' }, { status: 400 })
  }
  if (purchaseUpliftPercent !== undefined && ![0, 10, 15].includes(Number(purchaseUpliftPercent))) {
    return NextResponse.json({ error: '無効な上乗せ率です' }, { status: 400 })
  }

  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 売買契約書の発行後は取引内容（上乗せ率・事前同意）を凍結する。
  // ステータス・カテゴリー・案件内容・担当店舗は契約後も運用上変更が要るため対象外。
  if ((purchaseUpliftPercent !== undefined || preConsentSignature !== undefined) && await isDealContracted(id)) {
    return NextResponse.json({ error: DEAL_LOCKED_MESSAGE }, { status: 409 })
  }

  const updateData: any = {}
  if (detail !== undefined) updateData.detail = detail || null
  if (status !== undefined) updateData.status = status
  if (category !== undefined) updateData.category = category
  // 担当店舗の変更は管理者のみ
  if (storeId !== undefined && isAdmin) updateData.storeId = storeId || null
  // 案件発生日（管理・店舗とも編集可）。不正値は無視。
  if (occurredAt !== undefined) {
    const d = new Date(occurredAt)
    if (!isNaN(d.getTime())) updateData.occurredAt = d
  }
  // 紙で作成した売買契約書の取引年月日（古物台帳の法定記載事項）。null でクリア可。
  // 日付だけの入力（"YYYY-MM-DD"）は JST の当日として解釈する（UTC 解釈で前日にずれるのを防ぐ）
  if (paperContractAgreedAt !== undefined) {
    if (!paperContractAgreedAt) {
      updateData.paperContractAgreedAt = null
    } else {
      const raw = String(paperContractAgreedAt)
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+09:00` : raw
      const d = new Date(iso)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: '取引年月日が不正です' }, { status: 400 })
      }
      updateData.paperContractAgreedAt = d
    }
  }
  // 事前同意の署名（案件単位）。空文字/null でクリア可。
  if (preConsentSignature !== undefined) {
    updateData.preConsentSignature = preConsentSignature || null
    updateData.preConsentAt = preConsentSignature ? new Date() : null
  }
  // 買取金額の上乗せ率（0/10/15%）
  if (purchaseUpliftPercent !== undefined) updateData.purchaseUpliftPercent = Number(purchaseUpliftPercent)

  // アキクル案件は対応サービスに「アキクル」を含む店舗のみ扱える
  // （カテゴリー変更 or 店舗変更のいずれかがあった場合のみ検証。既存データはそのまま）
  const finalCategory = category !== undefined ? category : deal.category
  const finalStoreId = 'storeId' in updateData ? updateData.storeId : deal.storeId
  if (finalCategory === 'akikuru' && finalStoreId && (category !== undefined || 'storeId' in updateData)) {
    const targetStore = await prisma.store.findUnique({
      where: { id: finalStoreId }, select: { supportedServices: true },
    })
    if (!storeSupportsAkikuru(targetStore?.supportedServices)) {
      return NextResponse.json({ error: 'この店舗はアキクルに対応していません' }, { status: 400 })
    }
  }

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

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `案件を更新`, req: request })
  return NextResponse.json(updated)
}

// 案件の物理削除（管理者のみ。紐づく訪問予定・その配下の書類や品目もまとめて削除する）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isStore, isAdmin } = resolveAccess(session)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true, dealNumber: true } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  // 店舗は自店舗の案件のみ削除できる
  if (isStore && deal.storeId !== sessionUser.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 紐づく訪問・書類・品目もまとめて削除する（deleteDealCascade に集約）
  const { result: removed, calendarEvents } = await deleteDealCascade(id)

  // Googleカレンダーの予定も消す（失敗しても案件の削除自体は成功扱い）
  for (const ev of calendarEvents) {
    try {
      await deleteCalendarEvent(ev.storeId, ev.eventId)
    } catch (e) {
      console.error('[Deal DELETE] カレンダー予定の削除に失敗:', e)
    }
  }

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null,
    action: `案件を削除（訪問${removed.visits}件を含む）`, req: request,
  })
  return NextResponse.json({ success: true, removed })
}
