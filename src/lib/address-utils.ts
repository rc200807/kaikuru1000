/**
 * 住所ユーティリティ — 都道府県・市区町村の抽出＆近接スコアリング
 */

export function extractAddressParts(address: string): { prefecture: string; city: string } {
  const prefMatch = address.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/)
  const prefecture = prefMatch?.[1] || ''
  const rest = prefecture ? address.slice(prefecture.length) : address
  const cityMatch = rest.match(/^(.+?[市区町村郡])/)
  const city = cityMatch?.[1] || ''
  return { prefecture, city }
}

/** 47都道府県の隣接関係マップ */
export const NEIGHBOR_PREFECTURES: Record<string, string[]> = {
  '北海道': ['青森県'],
  '青森県': ['北海道', '岩手県', '秋田県'],
  '岩手県': ['青森県', '宮城県', '秋田県'],
  '宮城県': ['岩手県', '秋田県', '山形県', '福島県'],
  '秋田県': ['青森県', '岩手県', '宮城県', '山形県'],
  '山形県': ['秋田県', '宮城県', '福島県', '新潟県'],
  '福島県': ['宮城県', '山形県', '茨城県', '栃木県', '群馬県', '新潟県'],
  '茨城県': ['福島県', '栃木県', '埼玉県', '千葉県'],
  '栃木県': ['福島県', '茨城県', '群馬県', '埼玉県'],
  '群馬県': ['福島県', '栃木県', '埼玉県', '新潟県', '長野県'],
  '埼玉県': ['茨城県', '栃木県', '群馬県', '千葉県', '東京都', '山梨県', '長野県'],
  '千葉県': ['茨城県', '埼玉県', '東京都'],
  '東京都': ['埼玉県', '千葉県', '神奈川県', '山梨県'],
  '神奈川県': ['東京都', '山梨県', '静岡県'],
  '新潟県': ['山形県', '福島県', '群馬県', '長野県', '富山県'],
  '富山県': ['新潟県', '石川県', '長野県', '岐阜県'],
  '石川県': ['富山県', '福井県', '岐阜県'],
  '福井県': ['石川県', '岐阜県', '滋賀県', '京都府'],
  '山梨県': ['埼玉県', '東京都', '神奈川県', '長野県', '静岡県'],
  '長野県': ['群馬県', '埼玉県', '山梨県', '静岡県', '新潟県', '富山県', '岐阜県', '愛知県'],
  '岐阜県': ['富山県', '石川県', '福井県', '長野県', '愛知県', '三重県', '滋賀県'],
  '静岡県': ['神奈川県', '山梨県', '長野県', '愛知県'],
  '愛知県': ['長野県', '岐阜県', '静岡県', '三重県'],
  '三重県': ['岐阜県', '愛知県', '滋賀県', '京都府', '奈良県', '和歌山県'],
  '滋賀県': ['福井県', '岐阜県', '三重県', '京都府'],
  '京都府': ['福井県', '滋賀県', '三重県', '大阪府', '奈良県', '兵庫県'],
  '大阪府': ['京都府', '奈良県', '和歌山県', '兵庫県'],
  '兵庫県': ['京都府', '大阪府', '鳥取県', '岡山県'],
  '奈良県': ['京都府', '大阪府', '三重県', '和歌山県'],
  '和歌山県': ['三重県', '大阪府', '奈良県'],
  '鳥取県': ['兵庫県', '島根県', '岡山県', '広島県'],
  '島根県': ['鳥取県', '広島県', '山口県'],
  '岡山県': ['兵庫県', '鳥取県', '広島県', '香川県'],
  '広島県': ['鳥取県', '島根県', '岡山県', '山口県', '愛媛県'],
  '山口県': ['島根県', '広島県', '福岡県', '大分県'],
  '徳島県': ['香川県', '愛媛県', '高知県'],
  '香川県': ['岡山県', '徳島県', '愛媛県'],
  '愛媛県': ['広島県', '香川県', '徳島県', '高知県'],
  '高知県': ['徳島県', '愛媛県'],
  '福岡県': ['山口県', '大分県', '熊本県', '佐賀県'],
  '佐賀県': ['福岡県', '長崎県'],
  '長崎県': ['佐賀県'],
  '熊本県': ['福岡県', '大分県', '宮崎県', '鹿児島県'],
  '大分県': ['山口県', '福岡県', '熊本県', '宮崎県'],
  '宮崎県': ['大分県', '熊本県', '鹿児島県'],
  '鹿児島県': ['熊本県', '宮崎県'],
  '沖縄県': [],
}

export type StoreForScoring = {
  id: string
  name: string
  code: string
  prefecture: string | null
  address: string | null
}

export type ScoredStore = StoreForScoring & {
  score: number
  matchReason: string
}

/**
 * 顧客住所に近い店舗をスコアリングして返す
 */
export function scoreStoresByAddress(
  customerAddress: string,
  stores: StoreForScoring[],
): ScoredStore[] {
  const customer = extractAddressParts(customerAddress)
  if (!customer.prefecture) return []

  return stores
    .map(store => {
      let score = 0
      let matchReason = ''
      const storePref = store.prefecture || ''
      const storeAddr = store.address || ''
      const storeParts = extractAddressParts(storeAddr || storePref)
      const effectivePref = storeParts.prefecture || storePref

      if (customer.prefecture === effectivePref) {
        score += 10
        matchReason = '同一都道府県'

        if (customer.city && storeParts.city && customer.city === storeParts.city) {
          score += 10
          matchReason = '同一市区町村'
        }

        if (storeAddr && customer.city) {
          const customerWard = customer.city.match(/(.+?区)/)?.[1]
          if (customerWard && storeAddr.includes(customerWard)) {
            score += 5
            matchReason = '同一区内'
          }
        }
      } else if (NEIGHBOR_PREFECTURES[customer.prefecture]?.includes(effectivePref)) {
        score += 3
        matchReason = '隣接都道府県'
      }

      return { ...store, score, matchReason }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
}
