/**
 * 定期宅配（DeliveryShipment）をクライアントへ返す形に整える共通処理。
 *
 * 画像URLは DB に JSON 文字列で入っているので、必ず配列（認証プロキシURL）に変換して返す。
 * ここを route ごとに書いていたため、PATCH のレスポンスだけ trackingImageUrls が
 * 変換されずに JSON 文字列のまま返り、受け取った画面が `.map` で落ちていた
 * （管理ポータルで「査定完了」「振込完了」を押すとエラー画面になる原因）。
 *
 * 注意: 'use client' を付けないこと（サーバー専用の整形ヘルパー）
 */

function parseUrls(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * imageUrls / trackingImageUrls を認証プロキシ経由のURL配列に変換する。
 * Blob URL をクライアントに露出させないため、実URLは返さない。
 */
export function toClientShipment<T extends { id: string }>(shipment: T): T & {
  imageUrls: string[]
  trackingImageUrls: string[]
} {
  const s = shipment as T & { imageUrls?: unknown; trackingImageUrls?: unknown }
  const images = parseUrls(s.imageUrls)
  const tracking = parseUrls(s.trackingImageUrls)
  return {
    ...shipment,
    imageUrls: images.map((_, i) => `/api/delivery-shipments/${shipment.id}/images/${i}`),
    trackingImageUrls: tracking.map((_, i) => `/api/delivery-shipments/${shipment.id}/tracking-images/${i}`),
  }
}
