/**
 * 買取品目を画面用のかたちに整える共通処理。
 *
 * DB では `imageUrls` / `rakutenData` / `aiResearch` を JSON 文字列で持ち、
 * 画像は Blob の実URLをクライアントに露出させないため
 * `/api/purchase-items/{id}/images/{index}` の認証プロキシURLに差し替えて返す。
 *
 * **この整形を1箇所に集約するのが肝**。一覧取得（案件詳細GET）と
 * 登録・更新（POST/PATCH）で形が食い違うと、保存直後だけ画像が壊れる。
 * 画面側は「保存レスポンスの品目をそのまま state に差し込む」差分更新をするので、
 * 両者が同一の整形を通っている必要がある。
 */

/** shapePurchaseItem が必要とする Prisma の select（呼び出し側はこれを満たすこと） */
export const PURCHASE_ITEM_SHAPE_SELECT = {
  id: true,
  itemName: true,
  category: true,
  quantity: true,
  purchasePrice: true,
  imageUrls: true,
  janCode: true,
  rakutenData: true,
  aiResearch: true,
  aiResearchedAt: true,
  isAdditionalRequest: true,
  notes: true,
  visitScheduleId: true,
  inventoryItem: { select: { id: true } },
} as const

function parseJson(value: string | null | undefined): any {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

export function shapePurchaseItem(item: {
  id: string
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
  imageUrls: string | null
  janCode: string | null
  rakutenData: string | null
  aiResearch: string | null
  aiResearchedAt: Date | null
  isAdditionalRequest: boolean
  notes: string | null
  visitScheduleId?: string | null
  inventoryItem?: { id: string } | null
}) {
  const images = Array.isArray(parseJson(item.imageUrls)) ? (parseJson(item.imageUrls) as string[]) : []
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    quantity: item.quantity,
    purchasePrice: item.purchasePrice,
    // 実URLは返さない（認証プロキシ経由で配信する）
    imageUrls: images.map((_, idx) => `/api/purchase-items/${item.id}/images/${idx}`),
    janCode: item.janCode,
    rakutenData: parseJson(item.rakutenData),
    aiResearch: parseJson(item.aiResearch),
    aiResearchedAt: item.aiResearchedAt,
    isAdditionalRequest: item.isAdditionalRequest,
    notes: item.notes,
    convertedInventoryId: item.inventoryItem?.id ?? null,
    /**
     * 旧データ（訪問直下に紐づく品目）の判定用。
     * null でなければ訪問行の金額表示も変わるので、画面は差分更新ではなく
     * 案件まるごとの再取得にフォールバックする。
     */
    visitScheduleId: item.visitScheduleId ?? null,
  }
}
