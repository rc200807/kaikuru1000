// 運営者情報のスプレッドシート同期用 列定義（エクスポート/インポート共通・往復可能）。
// kind:
//   'key'      … 既存運営者の突合キー（運営者ID）。空欄なら新規作成。
//   'field'    … そのまま Operator フィールドに設定（空欄→null）。
//   'entity'   … 会社形態（ラベル⇔値を変換）。
//   'prefix'   … 法人種別（候補リストで検証）。
//   'bool'     … 真偽値（はい/いいえ 等）。
//   'services' … 対応サービス（ラベル区切り⇔JSON配列）。
//   'ref'      … 参照専用（エクスポートのみ。インポートでは無視）。
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABEL,
  CORPORATE_PREFIXES,
  OPERATOR_SUPPORTED_SERVICES,
  type EntityType,
} from './operator-utils'

export type OperatorSheetColumnKind = 'key' | 'field' | 'entity' | 'prefix' | 'bool' | 'services' | 'email' | 'ref'
export type OperatorSheetColumn = { key: string; header: string; kind: OperatorSheetColumnKind }

export const OPERATOR_SHEET_COLUMNS: OperatorSheetColumn[] = [
  { key: 'id',                     header: '運営者ID',                       kind: 'key' },
  { key: 'entityType',             header: '会社形態',                       kind: 'entity' },
  { key: 'corporatePrefix',        header: '法人種別',                       kind: 'prefix' },
  { key: 'name',                   header: '法人名',                         kind: 'field' },
  { key: 'address',                header: '所在地',                         kind: 'field' },
  { key: 'representativeName',     header: '代表者氏名',                     kind: 'field' },
  { key: 'representativeNameKana', header: '代表者氏名（フリガナ）',         kind: 'field' },
  { key: 'corporateNumber',        header: '法人番号',                       kind: 'field' },
  { key: 'invoiceRegistered',      header: 'インボイス登録',                 kind: 'bool' },
  { key: 'invoiceNumber',          header: '適格請求書発行事業者登録番号',   kind: 'field' },
  { key: 'phone',                  header: '電話番号',                       kind: 'field' },
  { key: 'email',                  header: 'メールアドレス',                 kind: 'email' },
  { key: 'antiquePermitNumber',    header: '古物営業許可番号',               kind: 'field' },
  { key: 'antiqueOfficeAddress',   header: '古物営業所住所',                 kind: 'field' },
  { key: 'antiqueLicenseHolder',   header: '古物営業法届出名義',             kind: 'field' },
  { key: 'publicSafetyCommission', header: '管轄公安委員会',                 kind: 'field' },
  { key: 'service',                header: '運営サービス',                   kind: 'field' },
  { key: 'supportedServices',      header: '対応サービス',                   kind: 'services' },
  { key: 'bankName',               header: '銀行名',                         kind: 'field' },
  { key: 'branchName',             header: '支店名',                         kind: 'field' },
  { key: 'accountType',            header: '口座種別',                       kind: 'field' },
  { key: 'accountNumber',          header: '口座番号',                       kind: 'field' },
  { key: 'accountHolder',          header: '口座名義',                       kind: 'field' },
  // 以下は参照専用（インポートでは変更しない）
  { key: 'storeCount',             header: '店舗数',                         kind: 'ref' },
  { key: 'createdAt',              header: '登録日',                         kind: 'ref' },
]

const ENTITY_TYPE_FROM_LABEL: Record<string, EntityType> = {
  '法人': 'corporation',
  'corporation': 'corporation',
  '個人事業主': 'sole_proprietor',
  'sole_proprietor': 'sole_proprietor',
}

/** 会社形態のセル値（ラベル/値）→ 保存値。空欄・不明値は undefined（呼び出し側でエラー扱い） */
export function entityTypeFromCell(cell: string): EntityType | undefined {
  const t = (cell || '').trim()
  const v = ENTITY_TYPE_FROM_LABEL[t]
  return v && (ENTITY_TYPES as readonly string[]).includes(v) ? v : undefined
}

/** 法人種別のセル値 → 保存値。空欄は null。候補外は undefined（エラー扱い） */
export function corporatePrefixFromCell(cell: string): string | null | undefined {
  const t = (cell || '').trim()
  if (!t) return null
  return (CORPORATE_PREFIXES as readonly string[]).includes(t) ? t : undefined
}

/** 真偽値セル。空欄は false */
export function boolFromCell(cell: string): boolean {
  const t = (cell || '').trim().toLowerCase()
  return ['true', '1', 'はい', '○', '◯', 'yes', 'y', '登録済', '登録'].includes(t)
}

const SERVICE_KEY_FROM_LABEL: Record<string, string> = Object.fromEntries(
  OPERATOR_SUPPORTED_SERVICES.flatMap(s => [[s.label, s.key], [s.key, s.key]]),
)

/** 対応サービスのセル値（ラベル/キーの区切り文字列）→ 正規化JSON配列文字列（不明値は無視） */
export function operatorServicesFromCell(cell: string): string {
  const keys = (cell || '').split(/[,、/／・\s]+/).map(s => s.trim()).filter(Boolean)
    .map(s => SERVICE_KEY_FROM_LABEL[s]).filter((k): k is string => !!k)
  return JSON.stringify(Array.from(new Set(keys)))
}

/** 対応サービスのJSON配列文字列 → ラベル区切り表示 */
export function operatorServicesLabel(json: string | null | undefined): string {
  if (!json) return ''
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return ''
    return OPERATOR_SUPPORTED_SERVICES.filter(s => arr.includes(s.key)).map(s => s.label).join(',')
  } catch {
    return ''
  }
}

export function entityTypeLabel(value: string): string {
  return ENTITY_TYPE_LABEL[value as EntityType] ?? value
}
