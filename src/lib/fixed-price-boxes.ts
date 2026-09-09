/**
 * 定額BOX（ボタン1つで買取品目として追加できる固定金額の商品）の中央定義。
 *
 * 1000円ボックス・エコ得BOX はどちらも「1回の買取につき1個まで」。
 * 品名・カテゴリーはこの定義の name をそのまま使い、重複判定も name で行う
 * （カテゴリー名は表示にも使われるため、判定キーを増やさず1本にする）。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */

export type FixedPriceBox = {
  /** 品名・カテゴリーに入る名前。重複判定のキーでもある */
  name: string
  /** 買取金額（円） */
  price: number
  /** ボタンのラベル */
  buttonLabel: string
}

export const FIXED_PRICE_BOXES: FixedPriceBox[] = [
  { name: '1000円ボックス', price: 1000, buttonLabel: '1000円ボックスで買取' },
  { name: 'エコ得BOX',      price: 1000, buttonLabel: 'エコ得BOXで買取' },
]

export const FIXED_PRICE_BOX_NAMES = FIXED_PRICE_BOXES.map(b => b.name)

/** その名前が定額BOX（1買取1個まで）かどうか */
export function isFixedPriceBox(name: string | null | undefined): boolean {
  return !!name && FIXED_PRICE_BOX_NAMES.includes(name)
}

export function findFixedPriceBox(name: string | null | undefined): FixedPriceBox | null {
  return FIXED_PRICE_BOXES.find(b => b.name === name) ?? null
}

/** 定額BOXの重複登録を弾くときのメッセージ */
export function fixedPriceBoxDuplicateMessage(name: string): string {
  return `${name}は1回の買取につき1個までです`
}
