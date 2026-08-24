import { prisma } from '@/lib/prisma'
import { jstTodayStart } from '@/lib/deal-list-query'

/**
 * 店舗ポータルの顧客詳細で必要なデータを 1 回でまとめて取得する。
 *
 * 顧客詳細は 1 画面俯瞰に作り替えた結果、
 *   顧客 / 案件 / 訪問予定 / 発行済み書類 / 買取希望品 / お問い合わせ / 宅配送付 / 日程提案
 * の 7〜8 本の API を並行で叩いていた。1 本あたり往復 0.3 秒前後（関数リージョンが
 * ユーザーから遠い）＋ そのぶんの Lambda 起動とDB接続が必要なので、サーバー側で
 * Promise.all してまとめて返す。
 *
 * 個別 API（/documents や /inquiries）は他の用途でも使うため残してあり、
 * 書類の組み立てはこのファイルの fetchCustomerDocuments を共有する。
 */

/** 買取希望品：画像URLはプロキシ経由に、AI査定はJSON→オブジェクトに変換して返す */
function toClientMemo(memo: Record<string, unknown> & { id: string; imageUrls?: string | null; aiAppraisal?: string | null }) {
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(memo.imageUrls || '[]') } catch { /* ignore */ }
  let aiAppraisal: unknown = null
  if (memo.aiAppraisal) {
    try { aiAppraisal = JSON.parse(memo.aiAppraisal) } catch { /* ignore */ }
  }
  return {
    ...memo,
    imageUrls: blobUrls.map((_: string, i: number) => `/api/purchase-memos/${memo.id}/images/${i}`),
    aiAppraisal,
  }
}

/** 宅配送付：画像URLはプロキシ経由に変換して返す */
function toClientShipment(s: Record<string, unknown> & { id: string; imageUrls?: string | null; trackingImageUrls?: string | null }) {
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(s.imageUrls || '[]') } catch { /* ignore */ }
  let trackingUrls: string[] = []
  try { trackingUrls = JSON.parse(s.trackingImageUrls || '[]') } catch { /* ignore */ }
  return {
    ...s,
    imageUrls: blobUrls.map((_: string, i: number) => `/api/delivery-shipments/${s.id}/images/${i}`),
    trackingImageUrls: trackingUrls.map((_: string, i: number) => `/api/delivery-shipments/${s.id}/tracking-images/${i}`),
  }
}

/**
 * 顧客に紐づく発行済み書類（見積書・売買契約書）の一覧。
 * PDF本体（base64）は読まず、存在するかどうかだけを判定する。
 */
export async function fetchCustomerDocuments(userId: string, storeId: string) {
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

  return schedules
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
}

const DEALS_LIMIT = 100

/** 顧客詳細1画面ぶんのデータ。取得できなければ null（＝この店舗の顧客ではない） */
export async function buildStoreCustomerOverview(storeId: string, userId: string) {
  const customer = await prisma.user.findFirst({
    // 統合で吸収された顧客は詳細を開かせない（一覧の条件と揃える）
    where: { id: userId, storeId, mergedIntoUserId: null },
    select: {
      id: true, name: true, furigana: true,
      lastName: true, firstName: true, lastNameKana: true, firstNameKana: true,
      email: true, phone: true, phone2: true, phone3: true, postalCode: true, address: true,
      internalNote: true,
      idDocumentPath: true, createdAt: true, lastVisitedAt: true,
      customerType: true,
      birthDate: true, occupation: true, leadSource: true, visitFrequencyMonths: true,
      idDocumentType: true, idName: true, idBirthDate: true,
      idAddress: true, idLicenseNumber: true, idExpiryDate: true,
      idOcrIssueReport: true,
      bankName: true, branchName: true, accountType: true,
      accountNumber: true, accountHolder: true,
      visitSchedules: {
        where: { visitDate: { gte: new Date() }, status: 'scheduled' },
        orderBy: { visitDate: 'asc' },
        take: 1,
        select: { visitDate: true, status: true },
      },
    },
  })
  if (!customer) return null

  const [dealRows, dealsTotal, schedules, documents, memos, inquiries, shipments, proposals] = await Promise.all([
    prisma.deal.findMany({
      where: { userId, storeId },
      // base64署名や紙契約書の画像URL配列を一覧に載せないため select を明示する
      select: {
        id: true, dealNumber: true, detail: true, status: true, category: true,
        occurredAt: true, createdAt: true, purchaseAmount: true, billingAmount: true,
        preConsentAt: true,
        member: { select: { id: true, name: true } },
        salesContract: { select: { id: true } },
        inquiry: { select: { id: true, inquiryType: true } },
        visitSchedules: {
          where: { status: { not: 'cancelled' }, visitDate: { gte: jstTodayStart() } },
          orderBy: { visitDate: 'asc' },
          take: 1,
          select: { id: true, visitDate: true, startTime: true, endTime: true },
        },
        _count: { select: { visitSchedules: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: DEALS_LIMIT,
    }),
    prisma.deal.count({ where: { userId, storeId } }),
    prisma.visitSchedule.findMany({
      where: { userId, storeId },
      include: {
        user: { select: { id: true, name: true, address: true, phone: true } },
        store: { select: { id: true, name: true } },
        deal: { select: { id: true, status: true } },
        salesContract: { select: { id: true, createdAt: true } },
        purchaseItems: { select: { id: true, itemName: true, category: true, quantity: true, purchasePrice: true } },
        workItems: { select: { id: true, workName: true, quantity: true, unitPrice: true } },
      },
      orderBy: { visitDate: 'asc' },
    }),
    fetchCustomerDocuments(userId, storeId),
    prisma.purchaseMemo.findMany({
      where: { userId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    (async () => {
      // お問い合わせは userId 一致に加えてメール・電話一致も拾う（自店舗宛のみ）
      const or: Record<string, string>[] = [{ userId }]
      if (customer.email) or.push({ email: customer.email })
      if (customer.phone) or.push({ phone: customer.phone })
      return prisma.inquiry.findMany({
        where: { storeId, OR: or },
        include: {
          purchaseMemos: { select: { id: true, title: true, imageUrls: true, status: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    })(),
    prisma.deliveryShipment.findMany({
      where: { userId },
      orderBy: { shipmentMonth: 'desc' },
      take: 100,
    }),
    prisma.visitRequest.findMany({
      where: { userId, storeId, requestedBy: 'store' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return {
    customer,
    deals: dealRows,
    dealsTotal,
    schedules,
    documents,
    memos: memos.map(m => toClientMemo(m as never)),
    inquiries,
    shipments: shipments.map(s => toClientShipment(s as never)),
    proposals,
  }
}
