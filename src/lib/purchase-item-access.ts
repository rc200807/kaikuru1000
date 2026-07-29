import { prisma } from '@/lib/prisma'

/**
 * 買取品目の所有者（担当店舗・顧客）の解決。
 *
 * 買取品目は案件直下（PurchaseItem.dealId）へ再ペアレント済みで、そちらが正。
 * VisitSchedule 経由（visitScheduleId）は後方互換で残っているだけなので、
 * 認可チェックで visitSchedule しか見ないと、案件直下の品目（visitScheduleId=null）が
 * 常に Forbidden になる。必ず両方から所有者を集めること。
 */
export const PURCHASE_ITEM_OWNER_SELECT = {
  deal: { select: { storeId: true, userId: true } },
  visitSchedule: { select: { storeId: true, userId: true } },
} as const

type OwnerShape = {
  deal: { storeId: string | null; userId: string } | null
  visitSchedule: { storeId: string; userId: string } | null
}

/** 品目に紐づく店舗ID・顧客IDを（案件・訪問の両方から）列挙する */
export function purchaseItemOwners(item: OwnerShape) {
  const storeIds = [item.deal?.storeId, item.visitSchedule?.storeId].filter((v): v is string => !!v)
  const userIds = [item.deal?.userId, item.visitSchedule?.userId].filter((v): v is string => !!v)
  return { storeIds, userIds }
}

/** 店舗アカウントがこの品目を扱えるか */
export function storeOwnsPurchaseItem(item: OwnerShape, storeId: string) {
  return purchaseItemOwners(item).storeIds.includes(storeId)
}

/** 顧客アカウントがこの品目を扱えるか */
export function customerOwnsPurchaseItem(item: OwnerShape, userId: string) {
  return purchaseItemOwners(item).userIds.includes(userId)
}

/** 所有者情報つきで品目を取得する（見つからなければ null） */
export async function findPurchaseItemWithOwners<T extends Record<string, true>>(itemId: string, select: T) {
  return prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { ...select, ...PURCHASE_ITEM_OWNER_SELECT },
  })
}
