/**
 * InventoryItem の書き込みデータ整形と一覧用マッピングの共有ヘルパー。
 * POST / PATCH / convert で共通利用する。
 */
import { isInventoryStatus, isInventoryCondition } from './inventory-status'

const STR_FIELDS = [
  'title', 'description', 'categoryName', 'brand', 'managementCode', 'janCode',
  'shippingMethod', 'shippingFromPrefecture', 'shippingDays', 'note',
] as const

const INT_FIELDS = [
  'costPrice', 'listingPrice', 'quantity', 'weightGrams', 'sizeW', 'sizeH', 'sizeD', 'soldPrice',
] as const

function toInt(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * body から InventoryItem の書き込みデータを組み立てる（渡されたキーのみ反映）。
 * imageUrls は配列を受け取り JSON 文字列に変換（最大10件）。
 * condition / status はホワイトリスト検証、shippingPayer は seller|buyer に正規化。
 */
export function buildInventoryWriteData(body: any): Record<string, any> {
  const data: Record<string, any> = {}
  for (const f of STR_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] == null ? null : String(body[f])
  }
  for (const f of INT_FIELDS) {
    if (body[f] !== undefined) data[f] = toInt(body[f])
  }
  if (body.condition !== undefined && isInventoryCondition(body.condition)) data.condition = body.condition
  if (body.status !== undefined && isInventoryStatus(body.status)) data.status = body.status
  if (body.shippingPayer !== undefined) data.shippingPayer = body.shippingPayer === 'buyer' ? 'buyer' : 'seller'
  if (body.imageUrls !== undefined) {
    const arr = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u: any) => typeof u === 'string') : []
    data.imageUrls = JSON.stringify(arr.slice(0, 10))
  }
  return data
}

/** Prisma の InventoryItem を一覧/詳細レスポンス用に整形（imageUrls JSON → images 配列） */
export function mapInventoryItem(it: any) {
  let images: string[] = []
  try {
    const a = JSON.parse(it.imageUrls || '[]')
    if (Array.isArray(a)) images = a.filter((u: any) => typeof u === 'string')
  } catch {
    /* ignore */
  }
  const { imageUrls, ...rest } = it
  return { ...rest, images }
}
