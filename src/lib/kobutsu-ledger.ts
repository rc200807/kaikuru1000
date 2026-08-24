/**
 * 古物台帳（古物商の帳簿）の中央定義。
 *
 * 古物営業法16条・同施行規則17条（別記様式第15号）で、古物を受け取ったときに
 * 次の事項を記録する義務がある（保存期間は最終記載日から3年）:
 *   1. 取引の年月日
 *   2. 古物の品目及び数量
 *   3. 古物の特徴
 *   4. 相手方の住所、氏名、職業及び年齢
 *   5. 本人確認の措置の区分（確認方法）
 * 加えて様式には「区別（買受け/委託）」「代価」「備考」欄がある。
 *
 * このシステムでは「売買契約書が発行された案件の買取品目」を1行として台帳を構成する。
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */

/** 古物営業法の法定13品目 */
export const KOBUTSU_CATEGORY_KEYS = [
  'art',        // 美術品類
  'clothing',   // 衣類
  'watch',      // 時計・宝飾品類
  'car',        // 自動車
  'motorcycle', // 自動二輪車及び原動機付自転車
  'bicycle',    // 自転車類
  'camera',     // 写真機類
  'office',     // 事務機器類
  'machine',    // 機械工具類
  'tool',       // 道具類
  'leather',    // 皮革・ゴム製品類
  'book',       // 書籍
  'ticket',     // 金券類
] as const
export type KobutsuCategoryKey = typeof KOBUTSU_CATEGORY_KEYS[number]

export const KOBUTSU_CATEGORY_LABEL: Record<KobutsuCategoryKey, string> = {
  art:        '美術品類',
  clothing:   '衣類',
  watch:      '時計・宝飾品類',
  car:        '自動車',
  motorcycle: '自動二輪車及び原動機付自転車',
  bicycle:    '自転車類',
  camera:     '写真機類',
  office:     '事務機器類',
  machine:    '機械工具類',
  tool:       '道具類',
  leather:    '皮革・ゴム製品類',
  book:       '書籍',
  ticket:     '金券類',
}

export const KOBUTSU_CATEGORIES = KOBUTSU_CATEGORY_KEYS.map(key => ({
  key, label: KOBUTSU_CATEGORY_LABEL[key],
}))

export function isKobutsuCategoryKey(v: unknown): v is KobutsuCategoryKey {
  return typeof v === 'string' && (KOBUTSU_CATEGORY_KEYS as readonly string[]).includes(v)
}

/**
 * 買取カテゴリ・品名から法定13品目を推定する。
 * 自動推定は入力補助であり、確定は店舗が台帳画面で指定できる（法定品目の判断は店舗の責任）。
 * 判定は「上にあるものを優先」。同じ語が複数品目に出る場合は具体的なものを先に並べる。
 */
const CATEGORY_KEYWORDS: { key: KobutsuCategoryKey; words: string[] }[] = [
  { key: 'ticket',     words: ['商品券', 'ギフト券', 'ギフトカード', '金券', '切手', '印紙', 'テレホンカード', 'プリペイド', '株券', 'チケット', '乗車券', '航空券'] },
  { key: 'motorcycle', words: ['バイク', 'オートバイ', '原付', '原動機付', 'スクーター', '自動二輪', 'モトクロス'] },
  { key: 'bicycle',    words: ['自転車', 'ロードバイク', 'ママチャリ', 'クロスバイク', 'マウンテンバイク'] },
  { key: 'car',        words: ['自動車', '乗用車', '軽トラ', 'タイヤ', 'ホイール', 'カーナビ', 'カー用品', 'エンジン'] },
  { key: 'watch',      words: ['時計', '腕時計', '宝石', '宝飾', 'ジュエリー', '指輪', 'リング', 'ネックレス', 'ピアス', 'ブレスレット', '貴金属', '金', 'プラチナ', 'ダイヤ', '真珠', 'パール'] },
  { key: 'camera',     words: ['カメラ', 'レンズ', '一眼', '双眼鏡', '望遠鏡', '顕微鏡', '三脚'] },
  { key: 'office',     words: ['パソコン', 'ノートpc', 'pc', 'デスクトップ', 'タブレット', 'プリンタ', 'コピー機', 'fax', 'シュレッダー', 'レジスター', '事務機'] },
  { key: 'machine',    words: ['家電', 'エアコン', '冷蔵庫', '洗濯機', 'テレビ', '電子レンジ', '炊飯器', '掃除機', '空気清浄機', '扇風機', 'ゲーム機', 'スマートフォン', 'スマホ', '携帯電話', '工具', '電動工具', 'ミシン', '発電機', '医療機器', 'オーディオ', 'アンプ', 'スピーカー'] },
  { key: 'leather',    words: ['バッグ', 'かばん', '鞄', '財布', '靴', 'スニーカー', 'ブーツ', 'ベルト', '毛皮', '皮革', 'レザー', 'ゴム'] },
  { key: 'clothing',   words: ['衣類', '洋服', '服', '着物', '和服', 'ジャケット', 'コート', 'シャツ', 'ズボン', 'スカート', 'ドレス', '帽子', 'タオル', '寝具', 'カーテン'] },
  { key: 'book',       words: ['書籍', '本', '漫画', 'マンガ', 'コミック', '雑誌', '文庫', '専門書', '古本'] },
  { key: 'art',        words: ['美術', '絵画', '書画', '掛軸', '彫刻', '骨董', '陶磁器', '茶道具', '版画', '美術品'] },
  { key: 'tool',       words: ['家具', 'テーブル', '椅子', 'ソファ', 'タンス', '楽器', 'ギター', 'ピアノ', 'スポーツ', 'ゴルフ', '釣具', 'おもちゃ', 'フィギュア', 'トレカ', 'cd', 'dvd', 'ブルーレイ', 'ゲームソフト', '食器', '刀剣'] },
]

export function guessKobutsuCategory(...sources: (string | null | undefined)[]): KobutsuCategoryKey | null {
  const hay = sources.filter(Boolean).join(' ').toLowerCase()
  if (!hay.trim()) return null
  for (const { key, words } of CATEGORY_KEYWORDS) {
    if (words.some(w => hay.includes(w.toLowerCase()))) return key
  }
  return null
}

/**
 * 「古物の特徴」の自動生成。品名・カテゴリ・JANコード・備考から特定に足る情報を組み立てる。
 * 店舗が台帳画面で上書きした場合はその値を使う（法定記載事項なので手入力を優先）。
 */
export function buildFeatures(item: {
  itemName: string
  category: string | null
  janCode: string | null
  notes: string | null
}): string {
  const parts: string[] = []
  if (item.itemName) parts.push(item.itemName)
  if (item.category) parts.push(item.category)
  if (item.janCode) parts.push(`JAN:${item.janCode}`)
  if (item.notes) parts.push(item.notes.replace(/\s+/g, ' ').trim())
  return parts.join(' / ')
}

/** 取引日時点の年齢。生年月日が "YYYY-MM-DD" 形式でないときは null */
export function ageAt(birthDate: string | null | undefined, at: Date): number | null {
  if (!birthDate) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(birthDate.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const by = Number(y), bm = Number(mo), bd = Number(d)
  // 取引日は JST 基準で判定する
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  const ty = jst.getUTCFullYear(), tm = jst.getUTCMonth() + 1, td = jst.getUTCDate()
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/** 本人確認の措置の区分（帳簿の「確認方法」欄） */
export function verificationMethod(user: {
  idDocumentType?: string | null
  idDocumentPath?: string | null
  selfieImagePath?: string | null
}): string | null {
  if (user.idDocumentType) {
    return user.selfieImagePath ? `${user.idDocumentType}（顔写真照合あり）` : user.idDocumentType
  }
  if (user.idDocumentPath) return '本人確認書類の提示'
  return null
}

/** 台帳の明細1行（買取品目1点） */
export type KobutsuLedgerRow = {
  /** 買取品目ID（補記の保存キー） */
  id: string
  /** 売買契約ID（台帳の1項目＝1案件のキー） */
  contractId: string
  dealId: string | null
  /** 案件番号（例: 20260824001）。案件に紐づかない旧データは null */
  dealNumber: string | null
  visitScheduleId: string | null
  /** 取引年月日（売買契約の締結日時。ISO文字列） */
  tradedAt: string
  /** 区別（このシステムの取引は買受けのみ） */
  tradeType: '買受け'
  /** 法定13品目 */
  categoryKey: KobutsuCategoryKey | null
  /** 品目が自動推定か手動指定か */
  categoryManual: boolean
  /** 社内の買取カテゴリ（参考表示） */
  internalCategory: string | null
  itemName: string
  quantity: number
  /** 代価（単価×数量） */
  price: number
  unitPrice: number
  features: string
  /** 特徴が手入力（上書き）か */
  featuresManual: boolean
  note: string | null
  customer: {
    id: string
    name: string
    address: string | null
    occupation: string | null
    age: number | null
    verification: string | null
  }
  /** 法定記載事項の欠落（画面で警告を出す） */
  missing: KobutsuMissingField[]
}

export type KobutsuMissingField = 'category' | 'features' | 'address' | 'occupation' | 'age' | 'verification'

export const KOBUTSU_MISSING_LABEL: Record<KobutsuMissingField, string> = {
  category:     '品目',
  features:     '特徴',
  address:      '住所',
  occupation:   '職業',
  age:          '年齢',
  verification: '確認方法',
}

/** 行から法定記載事項の欠落を洗い出す */
export function findMissingFields(row: Omit<KobutsuLedgerRow, 'missing'>): KobutsuMissingField[] {
  const missing: KobutsuMissingField[] = []
  if (!row.categoryKey) missing.push('category')
  if (!row.features.trim()) missing.push('features')
  if (!row.customer.address) missing.push('address')
  if (!row.customer.occupation) missing.push('occupation')
  if (row.customer.age == null) missing.push('age')
  if (!row.customer.verification) missing.push('verification')
  return missing
}

/** CSV の列定義（別記様式第15号の欄に合わせる） */
export const KOBUTSU_CSV_HEADER = [
  '取引年月日',
  '区別',
  '品目（法定13品目）',
  '品名',
  '数量',
  '特徴',
  '代価',
  '相手方の住所',
  '相手方の氏名',
  '相手方の職業',
  '相手方の年齢',
  '確認方法',
  '備考',
  '社内カテゴリ',
  '案件番号',
  '案件ID',
] as const

/** 1行をCSVのセル配列に変換する（列は KOBUTSU_CSV_HEADER と対応） */
export function toCsvRow(row: KobutsuLedgerRow, formatDate: (iso: string) => string): (string | number)[] {
  return [
    formatDate(row.tradedAt),
    row.tradeType,
    row.categoryKey ? KOBUTSU_CATEGORY_LABEL[row.categoryKey] : '',
    row.itemName,
    row.quantity,
    row.features,
    row.price,
    row.customer.address ?? '',
    row.customer.name,
    row.customer.occupation ?? '',
    row.customer.age ?? '',
    row.customer.verification ?? '',
    row.note ?? '',
    row.internalCategory ?? '',
    row.dealNumber ?? '',
    row.dealId ?? '',
  ]
}

/** "YYYY-MM-DD"（JST）→ その日の開始/終了時刻の Date。不正値は null */
export function jstDayBoundary(value: string | null | undefined, edge: 'start' | 'end'): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+09:00`)
  return isNaN(d.getTime()) ? null : d
}

/**
 * 台帳の1項目（案件単位）。一覧は案件ごとに1行で表示し、明細（品目ごと）は詳細画面で見る。
 * グループのキーは売買契約ID（1案件=1契約。案件に紐づかない旧データは訪問単位の契約）。
 */
export type KobutsuLedgerGroup = {
  contractId: string
  dealId: string | null
  dealNumber: string | null
  visitScheduleId: string | null
  tradedAt: string
  tradeType: '買受け'
  customer: KobutsuLedgerRow['customer']
  /** 明細件数（品目の行数） */
  itemCount: number
  /** 数量合計 */
  quantity: number
  /** 代価合計 */
  total: number
  /** 含まれる法定13品目（重複なし・表示順） */
  categories: KobutsuCategoryKey[]
  /** 品目未設定の明細があるか */
  hasUnsetCategory: boolean
  /** 「ロレックス デイトナ 他2点」のような一覧表示用の要約 */
  itemSummary: string
  /** 明細のいずれかで欠けている法定記載事項 */
  missing: KobutsuMissingField[]
  /** 明細（詳細画面用。一覧APIでは省略する） */
  rows?: KobutsuLedgerRow[]
}

/** 明細行を案件（契約）単位にまとめる。行の並び順（取引年月日の降順）は維持する */
export function groupLedgerRows(rows: KobutsuLedgerRow[], opts: { includeRows?: boolean } = {}): KobutsuLedgerGroup[] {
  const order: string[] = []
  const byContract = new Map<string, KobutsuLedgerRow[]>()
  for (const row of rows) {
    const list = byContract.get(row.contractId)
    if (list) list.push(row)
    else { byContract.set(row.contractId, [row]); order.push(row.contractId) }
  }

  return order.map(contractId => {
    const items = byContract.get(contractId)!
    const head = items[0]
    const categories: KobutsuCategoryKey[] = []
    const missing = new Set<KobutsuMissingField>()
    for (const item of items) {
      if (item.categoryKey && !categories.includes(item.categoryKey)) categories.push(item.categoryKey)
      for (const m of item.missing) missing.add(m)
    }
    const quantity = items.reduce((s, i) => s + i.quantity, 0)
    return {
      contractId,
      dealId: head.dealId,
      dealNumber: head.dealNumber,
      visitScheduleId: head.visitScheduleId,
      tradedAt: head.tradedAt,
      tradeType: head.tradeType,
      customer: head.customer,
      itemCount: items.length,
      quantity,
      total: items.reduce((s, i) => s + i.price, 0),
      categories,
      hasUnsetCategory: items.some(i => !i.categoryKey),
      itemSummary: items.length > 1
        ? `${head.itemName} 他${items.length - 1}件`
        : head.itemName,
      missing: [...missing],
      ...(opts.includeRows ? { rows: items } : {}),
    }
  })
}

/** 案件単位CSVの列（1案件=1行。明細は「品目」「品名」に要約して入れる） */
export const KOBUTSU_DEAL_CSV_HEADER = [
  '取引年月日',
  '区別',
  '品目（法定13品目）',
  '品名（要約）',
  '明細件数',
  '数量合計',
  '代価合計',
  '相手方の住所',
  '相手方の氏名',
  '相手方の職業',
  '相手方の年齢',
  '確認方法',
  '案件番号',
  '案件ID',
] as const

/** 案件単位1行をCSVのセル配列に変換する */
export function toDealCsvRow(group: KobutsuLedgerGroup, formatDate: (iso: string) => string): (string | number)[] {
  return [
    formatDate(group.tradedAt),
    group.tradeType,
    group.categories.map(c => KOBUTSU_CATEGORY_LABEL[c]).join('・'),
    group.itemSummary,
    group.itemCount,
    group.quantity,
    group.total,
    group.customer.address ?? '',
    group.customer.name,
    group.customer.occupation ?? '',
    group.customer.age ?? '',
    group.customer.verification ?? '',
    group.dealNumber ?? '',
    group.dealId ?? '',
  ]
}
