/**
 * 宅配買取の売買契約書（DeliveryContract）と、宅配の買取品目まわりのサーバー側共通処理。
 *
 * 宅配はお客様が非対面のため、売買契約書は署名なしで店舗が発行する（訪問の SalesContract とは別モデル）。
 * 宅配に買取品目を登録した場合、送付の査定金額（DeliveryShipment.purchaseAmount）は品目合計が正になる。
 * 発行後は品目を凍結する（書類と DB の内容がずれないように）。
 *
 * 注意: 'use client' を付けないこと（サーバー専用）
 */
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { sumPurchaseItems } from './purchase-item-amount'

export const DELIVERY_CONTRACT_LOCKED_MESSAGE = '売買契約書が発行済みのため、買取品目は編集できません'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 契約番号。送付番号（HD-YYYYMM-NNNN）から一意に決まる */
export function deliveryContractNo(shipmentNumber: string): string {
  return `HK-${shipmentNumber.replace(/^HD-/, '')}`
}

/** 送付に売買契約書が発行済みか */
export async function isShipmentContracted(shipmentId: string | null | undefined): Promise<boolean> {
  if (!shipmentId) return false
  const c = await prisma.deliveryContract.findUnique({ where: { shipmentId }, select: { id: true } })
  return !!c
}

/**
 * 宅配の品目合計で送付の査定金額を更新する（品目が0件になったら null に戻す）。
 * 集計（purchase-aggregation.ts）は DeliveryShipment.purchaseAmount を見るので、ここで常に揃える。
 */
export async function recomputeShipmentAmount(
  tx: Prisma.TransactionClient,
  shipmentId: string,
): Promise<number | null> {
  const items = await tx.purchaseItem.findMany({
    where: { deliveryShipmentId: shipmentId },
    select: { purchasePrice: true },
  })
  const amount = items.length > 0 ? sumPurchaseItems(items) : null
  await tx.deliveryShipment.update({ where: { id: shipmentId }, data: { purchaseAmount: amount } })
  return amount
}

/**
 * 店舗・管理者が送付を操作できるか判定する。
 * 送付には店舗IDが無いので、顧客の担当店舗（User.storeId）で判定する（既存の PATCH と同じ基準）。
 */
export async function resolveShipmentAccess(shipmentId: string, sessionUser: { role?: string; id?: string } | null | undefined) {
  const role = sessionUser?.role ?? ''
  const isStore = role === 'store'
  const isAdmin = ADMIN_ROLES.includes(role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  const shipment = await prisma.deliveryShipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, userId: true, status: true, shipmentNumber: true, user: { select: { storeId: true } } },
  })
  if (!shipment) return { error: '送付記録が見つかりません', status: 404 as const }
  if (isStore && shipment.user.storeId !== sessionUser?.id) return { error: 'Forbidden', status: 403 as const }
  return { shipment, isStore, isAdmin }
}
