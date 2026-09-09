/**
 * 買取金額の集計条件の中央定義。
 *
 * 買取品目（PurchaseItem）は案件（Deal）に紐づくようになったため、集計の正は
 * Deal.purchaseAmount である。VisitSchedule.purchaseAmount は訪問詳細から登録した
 * 旧データにしか入らず、案件詳細から品目を登録した取引では null のままになる。
 * ダッシュボード類がこの旧フィールドを合計していたため、買取金額がどの画面でも
 * 0 円に見えていた。集計はすべてこのファイルの条件を通すこと。
 *
 * 宅配買取（DeliveryShipment）は案件を作らないため、金額がどの集計にも入っていなかった。
 * 「買い取った金額」には宅配の査定額も含める。
 *
 * 注意: 'use client' を付けないこと（サーバー専用ヘルパーを含む）
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { jstMonthKey } from '@/lib/datetime'

/** 失注ステータス（買取実績に含めない）。'lost' は旧データの後方互換 */
export const LOST_DEAL_STATUSES = ['lost_after_visit', 'lost_no_visit', 'lost']

/** 宅配買取のうち金額が確定しているステータス */
export const APPRAISED_SHIPMENT_STATUSES = ['appraised', 'transferred']

/**
 * 買取実績として数える案件の条件。
 * 金額が入っている（品目が登録された）かつ失注でない案件を対象にする。
 * ステータスを「契約以降」に限定はしない — 品目を登録した時点で買取額は確定しており、
 * 店舗がステータスを進める前でもダッシュボードに反映されるべきだから。
 */
export function purchasedDealWhere(extra?: Prisma.DealWhereInput): Prisma.DealWhereInput {
  return {
    purchaseAmount: { gt: 0 },
    status: { notIn: LOST_DEAL_STATUSES },
    ...extra,
  }
}

/** 集計対象の宅配買取（査定完了以降で金額が入っているもの）の条件 */
export function appraisedShipmentWhere(extra?: Prisma.DeliveryShipmentWhereInput): Prisma.DeliveryShipmentWhereInput {
  return {
    status: { in: APPRAISED_SHIPMENT_STATUSES },
    purchaseAmount: { not: null },
    ...extra,
  }
}

/** 直近 months ヶ月ぶんの月キー（JST・古い順）。ゼロ埋め用 */
export function recentMonthKeys(months: number, from: Date = new Date()): string[] {
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    keys.push(jstMonthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)))
  }
  return keys
}

export type PurchaseTotals = {
  /** 案件 + 宅配の合計金額（円） */
  amount: number
  /** 件数（案件数 + 宅配件数） */
  count: number
}

/**
 * 買取金額の合計を案件と宅配の両方から取る。
 * dealWhere / shipmentWhere には期間・店舗・顧客などの追加条件を渡す。
 */
export async function sumPurchaseAmount(
  dealWhere: Prisma.DealWhereInput = {},
  shipmentWhere: Prisma.DeliveryShipmentWhereInput = {},
): Promise<PurchaseTotals> {
  const [deals, shipments] = await Promise.all([
    prisma.deal.aggregate({
      where: purchasedDealWhere(dealWhere),
      _sum: { purchaseAmount: true },
      _count: { _all: true },
    }),
    prisma.deliveryShipment.aggregate({
      where: appraisedShipmentWhere(shipmentWhere),
      _sum: { purchaseAmount: true },
      _count: { _all: true },
    }),
  ])
  return {
    amount: (deals._sum.purchaseAmount ?? 0) + (shipments._sum.purchaseAmount ?? 0),
    count: deals._count._all + shipments._count._all,
  }
}

/**
 * 月次の買取金額（案件は発生日、宅配は送付月で計上）。
 * 返り値は「YYYY-MM」→ 金額 のマップ（指定した月キーはすべて 0 で埋まる）。
 * groupBy でDB側集計するため、行をJSに載せない。
 */
export async function monthlyPurchaseAmount(
  monthKeys: string[],
  dealWhere: Prisma.DealWhereInput = {},
  shipmentWhere: Prisma.DeliveryShipmentWhereInput = {},
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const k of monthKeys) result[k] = 0
  if (monthKeys.length === 0) return result

  const first = monthKeys[0]
  const rangeStart = new Date(`${first}-01T00:00:00+09:00`)

  const [dealRows, shipmentRows] = await Promise.all([
    prisma.deal.findMany({
      where: purchasedDealWhere({ occurredAt: { gte: rangeStart }, ...dealWhere }),
      select: { occurredAt: true, purchaseAmount: true },
    }),
    prisma.deliveryShipment.groupBy({
      by: ['shipmentMonth'],
      where: appraisedShipmentWhere({ shipmentMonth: { in: monthKeys }, ...shipmentWhere }),
      _sum: { purchaseAmount: true },
    }),
  ])

  for (const d of dealRows) {
    const key = jstMonthKey(d.occurredAt)
    if (key in result) result[key] += d.purchaseAmount ?? 0
  }
  for (const s of shipmentRows) {
    if (s.shipmentMonth in result) result[s.shipmentMonth] += s._sum.purchaseAmount ?? 0
  }
  return result
}
