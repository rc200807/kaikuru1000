/**
 * 顧客の物理削除。
 *
 * User には「必須のリレーション」が複数ぶら下がっている（Deal / VisitSchedule / AkiyaCase）。
 * これらは onDelete が指定されていないため既定の Restrict になり、案件や訪問がある顧客は
 * そのまま delete すると外部キー違反で失敗する。ここで削除順を1箇所に集約し、
 * 「紐づいているものがあっても顧客を削除できる」ようにする。
 *
 * 案件の削除（deleteDealCascade）と同じ考え方: 案件配下の品目・書類は FK の Cascade で落ち、
 * 再ペアレント前の古いデータ（訪問にだけ紐づく行）だけ明示的に消す。
 *
 * 注意: 'use client' を付けないこと（サーバー専用）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type DeleteCustomerResult = {
  deals: number
  visits: number
  akiyaCases: number
  shipments: number
}

/** 案件・訪問に紐づく行を消してから顧客本体を削除する */
export async function deleteCustomerCascade(userId: string): Promise<DeleteCustomerResult> {
  const [visits, deals, akiyaCases] = await Promise.all([
    prisma.visitSchedule.findMany({ where: { userId }, select: { id: true } }),
    prisma.deal.findMany({ where: { userId }, select: { id: true } }),
    prisma.akiyaCase.findMany({ where: { userId }, select: { id: true } }),
  ])
  const visitIds = visits.map(v => v.id)

  const shipments = await prisma.$transaction(async (tx) => {
    if (visitIds.length > 0) {
      // 再ペアレント前の古いデータ（訪問にだけぶら下がる行）
      await tx.salesContract.deleteMany({ where: { visitScheduleId: { in: visitIds } } })
      await tx.estimate.deleteMany({ where: { visitScheduleId: { in: visitIds } } })
      await tx.purchaseItem.deleteMany({ where: { visitScheduleId: { in: visitIds } } })
      await tx.workItem.deleteMany({ where: { visitScheduleId: { in: visitIds } } })
      // 訪問リクエストは visitScheduleId を FK なしで持つため、参照を切ってから訪問を消す
      await tx.visitRequest.updateMany({ where: { visitScheduleId: { in: visitIds } }, data: { visitScheduleId: null } })
      await tx.visitSchedule.deleteMany({ where: { userId } })
    }
    // 案件配下（品目・請求項目・契約・見積・録音・アキクル請求）は Cascade で落ちる
    await tx.deal.deleteMany({ where: { userId } })
    // 空き家管理案件（配下の記録は Cascade）
    await tx.akiyaCase.deleteMany({ where: { userId } })
    // 宅配送付は Cascade だが件数を返したいので先に数える
    const shipmentCount = await tx.deliveryShipment.count({ where: { userId } })

    // ライセンスキーは解放して再利用できるようにする
    const user = await tx.user.findUnique({ where: { id: userId }, select: { licenseKeyId: true } })
    if (user?.licenseKeyId) {
      await tx.licenseKey.update({ where: { id: user.licenseKeyId }, data: { isUsed: false } })
    }

    await tx.user.delete({ where: { id: userId } })
    return shipmentCount
  })

  return { deals: deals.length, visits: visitIds.length, akiyaCases: akiyaCases.length, shipments }
}

export type DeleteDealResult = {
  visits: number
  contracts: number
  estimates: number
  purchaseItems: number
  workItems: number
}

/**
 * 案件の削除。配下の訪問・書類・品目もまとめて消す。
 * 「全訪問は必ず案件に属する」不変条件があるため、訪問のリンクだけ外すと訪問が孤立し、
 * その配下の契約書・見積がどの案件からも辿れなくなるので、訪問ごと削除する。
 */
export async function deleteDealCascade(dealId: string): Promise<{
  result: DeleteDealResult
  /** Googleカレンダーの後始末に使う（呼び出し側で削除する） */
  calendarEvents: { storeId: string; eventId: string }[]
}> {
  const visits = await prisma.visitSchedule.findMany({
    where: { dealId },
    select: { id: true, storeId: true, googleCalendarEventId: true },
  })
  const visitIds = visits.map(v => v.id)

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let contracts = 0, estimates = 0, purchaseItems = 0, workItems = 0
    if (visitIds.length > 0) {
      contracts     = (await tx.salesContract.deleteMany({ where: { visitScheduleId: { in: visitIds } } })).count
      estimates     = (await tx.estimate.deleteMany({ where: { visitScheduleId: { in: visitIds } } })).count
      purchaseItems = (await tx.purchaseItem.deleteMany({ where: { visitScheduleId: { in: visitIds } } })).count
      workItems     = (await tx.workItem.deleteMany({ where: { visitScheduleId: { in: visitIds } } })).count
      await tx.visitRequest.updateMany({ where: { visitScheduleId: { in: visitIds } }, data: { visitScheduleId: null } })
      await tx.visitSchedule.deleteMany({ where: { dealId } })
    }
    await tx.deal.delete({ where: { id: dealId } })
    return { visits: visitIds.length, contracts, estimates, purchaseItems, workItems }
  })

  const calendarEvents = visits
    .filter((v): v is typeof v & { googleCalendarEventId: string } => !!v.googleCalendarEventId)
    .map(v => ({ storeId: v.storeId, eventId: v.googleCalendarEventId }))

  return { result, calendarEvents }
}
