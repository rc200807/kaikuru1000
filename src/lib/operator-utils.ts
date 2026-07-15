/**
 * 運営者情報（Operator）ヘルパー
 * - 会社形態プレフィックス一覧
 * - 正式名称の組み立て
 */

export const ENTITY_TYPES = ['corporation', 'sole_proprietor'] as const
export type EntityType = typeof ENTITY_TYPES[number]

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  corporation:     '法人',
  sole_proprietor: '個人事業主',
}

/** 一般的な法人種別。順序は使用頻度順（分類用。実際の法人名表記は name フィールドに直接入力する） */
export const CORPORATE_PREFIXES = [
  '株式会社',
  '有限会社',
  '合同会社',
  '合資会社',
  '合名会社',
  '一般社団法人',
  '一般財団法人',
  '公益社団法人',
  '公益財団法人',
  '医療法人',
  '社会福祉法人',
  '学校法人',
  'NPO法人',
  '宗教法人',
  '特定非営利活動法人',
] as const

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

/**
 * 表示用の正式名称。
 * name フィールドに「株式会社○○」等プレフィックス込みのフルネームを直接入力してもらう方針のため、
 * そのまま name を返す（法人・個人事業主の区別なし）。
 */
export function formalName(operator: { name: string }): string {
  return operator.name
}

/** 対応サービス（複数選択）のキー。順序はそのまま表示順になる。zod enum等でそのまま使えるようタプルで定義 */
export const OPERATOR_SUPPORTED_SERVICE_KEYS = ['kaikuru', 'akikuru'] as const
export type OperatorSupportedServiceKey = typeof OPERATOR_SUPPORTED_SERVICE_KEYS[number]

export const OPERATOR_SUPPORTED_SERVICE_LABEL: Record<OperatorSupportedServiceKey, string> = {
  kaikuru: '買いクル',
  akikuru: 'アキクル',
}
export const OPERATOR_SUPPORTED_SERVICES = OPERATOR_SUPPORTED_SERVICE_KEYS.map(key => ({
  key, label: OPERATOR_SUPPORTED_SERVICE_LABEL[key],
}))

/** 対応サービスのJSON文字列 ⇔ 配列 変換ヘルパー */
export function parseSupportedServices(json: string | null | undefined): OperatorSupportedServiceKey[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((v): v is OperatorSupportedServiceKey => OPERATOR_SUPPORTED_SERVICE_KEYS.includes(v)) : []
  } catch {
    return []
  }
}

/**
 * 契約書・見積書に表示する店舗名（買取業者名）。
 * 「買いクル○○店」形式にする。既に「買いクル」で始まる場合は二重付与しない。
 */
export function storeContractName(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return '買いクル'
  return n.startsWith('買いクル') ? n : `買いクル${n}`
}
