/**
 * 買取品目（PurchaseItem）の金額の中央定義。
 *
 * 買取金額は「その品目に対して実際に支払う金額そのもの」であり、**数量は掛けない**。
 * 1000円ボックスのように数量と単価の関係が一定でない買い方が多く、現場は
 * 数量を参考情報として入れつつ、金額は合計額を直接入力する運用になっているため。
 * （以前は purchasePrice × quantity を合計していたので、数量を2にすると金額が倍になっていた）
 *
 * 請求項目（WorkItem）は「単価 × 数量」のままなので、こちらと混同しないこと。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント双方から import する純関数）
 */

type PurchaseItemAmountSource = { purchasePrice?: number | null }

/** 買取品目1行の金額（円）。数量は掛けない */
export function purchaseItemAmount(item: PurchaseItemAmountSource): number {
  return item.purchasePrice ?? 0
}

/** 買取品目の合計金額（円）。数量は掛けない */
export function sumPurchaseItems(items: readonly PurchaseItemAmountSource[]): number {
  return items.reduce((sum, item) => sum + purchaseItemAmount(item), 0)
}
