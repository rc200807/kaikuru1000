/**
 * 楽天商品検索API連携
 * JANコード（バーコード）から商品情報を検索する
 */

export type RakutenProduct = {
  productName: string        // 商品名
  brandName: string | null   // ブランド名
  makerName: string | null   // メーカー名
  janCode: string            // JANコード
  mediumImageUrl: string | null // 商品画像URL
  productUrlPC: string | null   // 商品ページURL
  averagePrice: number | null   // 平均価格
  genreName: string | null      // ジャンル名
  reviewCount: number | null    // レビュー数
  reviewAverage: number | null  // レビュー平均点
}

type RakutenApiResponse = {
  Products?: Array<{
    Product: {
      productName: string
      brandName?: string
      makerName?: string
      janCode: string
      mediumImageUrl?: string
      productUrlPC?: string
      averagePrice?: number
      genreName?: string
      reviewCount?: number
      reviewAverage?: number
    }
  }>
  error?: string
  error_description?: string
}

/**
 * 楽天商品検索APIでJANコードから商品情報を取得する
 *
 * @param janCode JANコード（8桁または13桁）
 * @param appIdOverride 楽天アプリID（省略時は環境変数から取得）
 * @returns 商品情報。見つからない場合やエラー時は null
 */
export async function searchByJanCode(janCode: string, appIdOverride?: string): Promise<RakutenProduct | null> {
  const appId = appIdOverride || process.env.RAKUTEN_APP_ID
  if (!appId) {
    console.warn('[rakuten] RAKUTEN_APP_ID が未設定です')
    return null
  }

  // JANコードバリデーション（8桁 or 13桁の数字）
  const cleaned = janCode.trim()
  if (!/^\d{8}$|^\d{13}$/.test(cleaned)) {
    console.warn(`[rakuten] 無効なJANコード: ${janCode}`)
    return null
  }

  try {
    const url = new URL('https://app.rakuten.co.jp/services/api/Product/Search/20170426')
    url.searchParams.set('applicationId', appId)
    url.searchParams.set('keyword', cleaned)
    url.searchParams.set('hits', '1')
    url.searchParams.set('formatVersion', '2')

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      console.error(`[rakuten] API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data: RakutenApiResponse = await res.json()

    if (data.error) {
      console.error(`[rakuten] API error: ${data.error} - ${data.error_description}`)
      return null
    }

    if (!data.Products || data.Products.length === 0) {
      return null
    }

    const p = data.Products[0].Product

    return {
      productName: p.productName,
      brandName: p.brandName || null,
      makerName: p.makerName || null,
      janCode: p.janCode || cleaned,
      mediumImageUrl: p.mediumImageUrl || null,
      productUrlPC: p.productUrlPC || null,
      averagePrice: p.averagePrice || null,
      genreName: p.genreName || null,
      reviewCount: p.reviewCount || null,
      reviewAverage: p.reviewAverage || null,
    }
  } catch (err) {
    console.error('[rakuten] 検索エラー:', err)
    return null
  }
}
