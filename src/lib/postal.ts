/**
 * 郵便番号 → 住所の解決（zipcloud API）
 * - クライアント用のプロキシ /api/postal-lookup と、公開フォームのサーバー側フォールバックで共有する
 */

export type PostalAddress = {
  address: string      // 都道府県 + 市区町村 + 町域（番地以降は含まない）
  prefecture: string
  city: string
  town: string
}

/** ハイフン・全角ハイフン・空白を除去して7桁に正規化（不正なら null） */
export function normalizePostalCode(input: string | null | undefined): string | null {
  const cleaned = (input ?? '').replace(/[-ー－\s]/g, '').trim()
  return /^\d{7}$/.test(cleaned) ? cleaned : null
}

/**
 * 郵便番号から住所を検索する。見つからない・失敗した場合は null を返す（呼び出し側の処理は止めない）
 */
export async function lookupPostalAddress(postalCode: string): Promise<PostalAddress | null> {
  const zipcode = normalizePostalCode(postalCode)
  if (!zipcode) return null

  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`)
    if (!res.ok) return null
    const data = await res.json()
    const r = data?.results?.[0]
    if (!r) return null
    return {
      address: `${r.address1}${r.address2}${r.address3}`,
      prefecture: r.address1,
      city: r.address2,
      town: r.address3,
    }
  } catch {
    return null
  }
}
