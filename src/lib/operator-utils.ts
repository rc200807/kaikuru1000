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

export const PREFIX_POSITIONS = ['before', 'after'] as const
export type PrefixPosition = typeof PREFIX_POSITIONS[number]

export const PREFIX_POSITION_LABEL: Record<PrefixPosition, string> = {
  before: '前（例: 株式会社A）',
  after:  '後（例: A株式会社）',
}

/** 一般的な法人種別。順序は使用頻度順 */
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

export function isPrefixPosition(v: unknown): v is PrefixPosition {
  return typeof v === 'string' && (PREFIX_POSITIONS as readonly string[]).includes(v)
}

/**
 * 正式名称を組み立てる
 * - 個人事業主: 屋号そのまま
 * - 法人: prefixPosition に応じて prefix + name または name + prefix
 */
export function formalName(operator: {
  entityType: string | null | undefined
  corporatePrefix: string | null | undefined
  prefixPosition: string | null | undefined
  name: string
}): string {
  if (operator.entityType !== 'corporation') return operator.name
  const prefix = operator.corporatePrefix?.trim()
  if (!prefix) return operator.name
  return operator.prefixPosition === 'after'
    ? `${operator.name}${prefix}`
    : `${prefix}${operator.name}`
}
