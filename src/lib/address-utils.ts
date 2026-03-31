/**
 * 住所ユーティリティ — 都道府県・市区町村の抽出＆近接スコアリング＆住所照合
 */

/**
 * 全角数字→半角数字、全角ハイフン→半角ハイフン、スペース除去などの正規化
 */
function normalizeAddress(addr: string): string {
  return addr
    // 全角数字→半角
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
    // 全角ハイフン系→半角ハイフン
    .replace(/[ー－—–‐―〜~]/g, '-')
    // 全角英字→半角
    .replace(/[Ａ-Ｚａ-ｚ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + (ch >= 'ａ' ? 0x61 : 0x41))
    )
    // スペース除去
    .replace(/[\s\u3000]+/g, '')
    // 「丁目」「番地」「号」を正規化
    .replace(/(\d+)丁目/g, '$1-')
    .replace(/(\d+)番地?/g, '$1-')
    .replace(/(\d+)号室?/g, '$1')
    .replace(/(\d+)号/g, '$1')
    // 「の」を数字間のハイフンに
    .replace(/(\d+)の(\d+)/g, '$1-$2')
    // 末尾ハイフンを除去
    .replace(/-+$/, '')
    // 連続ハイフンを1つに
    .replace(/-{2,}/g, '-')
    // 先頭ハイフンを除去
    .replace(/^-+/, '')
}

/**
 * 2つの文字列の類似度を0〜1で返す（レーベンシュタイン距離ベース）
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const lenA = a.length
  const lenB = b.length
  if (lenA === 0 || lenB === 0) return 0

  const matrix: number[][] = []
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  const maxLen = Math.max(lenA, lenB)
  return 1 - matrix[lenA][lenB] / maxLen
}

/**
 * 登録住所と身分証住所の一致判定（ファジーマッチ）
 *
 * 判定基準:
 * 1. 正規化後の完全一致 → true
 * 2. 都道府県 + 市区町村が一致 → true
 * 3. 正規化後の類似度が70%以上 → true
 */
export function isAddressMatch(registered: string, idAddress: string): boolean {
  if (!registered || !idAddress) return false

  const normReg = normalizeAddress(registered)
  const normId = normalizeAddress(idAddress)

  // 完全一致
  if (normReg === normId) return true

  // 一方が他方を含む（短縮表記の場合）
  if (normReg.includes(normId) || normId.includes(normReg)) return true

  // 都道府県 + 市区町村の一致判定
  const regParts = extractAddressParts(registered)
  const idParts = extractAddressParts(idAddress)

  if (regParts.prefecture && idParts.prefecture) {
    // 都道府県が一致、かつ市区町村が一致 → OK
    if (regParts.prefecture === idParts.prefecture && regParts.city && idParts.city && regParts.city === idParts.city) {
      return true
    }
  }

  // ファジーマッチ: 正規化後の類似度65%以上
  if (similarity(normReg, normId) >= 0.65) return true

  return false
}

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
  distanceKm: number | null
}

/**
 * 2点間の距離(km)をHaversine公式で計算
 */
export function haversineDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371 // 地球半径(km)
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 顧客住所に近い店舗をスコアリングして返す
 *
 * スコアリング基準:
 *   25 = 同一区内（◎◎ 最優先）
 *   20 = 同一市区町村（◎ 高優先）
 *   15 = 近隣市区町村（◎ 同一県内・近接エリア）← NEW
 *   10 = 同一都道府県（○ 中優先）
 *    3 = 隣接都道府県（△ 低優先）
 *
 * 同一スコア内では距離が近い順にソート
 */
export function scoreStoresByAddress(
  customerAddress: string,
  stores: StoreForScoring[],
  customerCoords?: { lat: number; lng: number } | null,
  storeCoords?: Map<string, { lat: number; lng: number }>,
): ScoredStore[] {
  const customer = extractAddressParts(customerAddress)
  if (!customer.prefecture) return []

  // 顧客の市名部分を抽出（区を除いた市名）
  // 例: "渋谷区" → null, "横浜市中区" → "横浜市", "さいたま市大宮区" → "さいたま市"
  const customerBaseCity = customer.city.match(/^(.+?市)/)?.[1]

  return stores
    .map(store => {
      let score = 0
      let matchReason = ''
      let distanceKm: number | null = null
      const storePref = store.prefecture || ''
      const storeAddr = store.address || ''
      const storeParts = extractAddressParts(storeAddr || storePref)
      const effectivePref = storeParts.prefecture || storePref

      // 距離計算（座標がある場合）
      if (customerCoords && storeCoords?.has(store.id)) {
        const sc = storeCoords.get(store.id)!
        distanceKm = Math.round(haversineDistanceKm(
          customerCoords.lat, customerCoords.lng,
          sc.lat, sc.lng,
        ) * 10) / 10
      }

      if (customer.prefecture === effectivePref) {
        score += 10
        matchReason = '同一都道府県'

        if (customer.city && storeParts.city && customer.city === storeParts.city) {
          // 完全一致（同一市区町村）
          score += 10
          matchReason = '同一市区町村'
        } else if (customer.city && storeParts.city) {
          // 同一市内の別の区（例: 横浜市中区 vs 横浜市港北区）
          const storeBaseCity = storeParts.city.match(/^(.+?市)/)?.[1]
          if (customerBaseCity && storeBaseCity && customerBaseCity === storeBaseCity) {
            score += 8
            matchReason = '同一市内'
          } else if (distanceKm !== null && distanceKm <= 15) {
            // 距離15km以内なら近隣市区町村ボーナス
            score += 5
            matchReason = '近隣エリア'
          }
        }

        // 区レベルの一致ボーナス
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

        // 隣接県でも距離が近い場合はボーナス（県境付近）
        if (distanceKm !== null && distanceKm <= 20) {
          score += 4
          matchReason = '近隣エリア（県境）'
        }
      }

      // 距離ボーナス（全体に適用、スコアが同じ場合のソートに活用）
      // 近い店舗ほど同一スコア内で優先される

      return { ...store, score, matchReason, distanceKm }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => {
      // まずスコア降順、同スコアなら距離昇順
      if (b.score !== a.score) return b.score - a.score
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm
      if (a.distanceKm !== null) return -1
      if (b.distanceKm !== null) return 1
      return 0
    })
}
