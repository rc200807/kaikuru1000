// 顧客情報のスプレッドシート同期用 列定義（エクスポート/インポート共通・往復可能）。
//
// kind:
//   'key'      … 既存顧客の突合キー（顧客ID）。空欄なら新規作成。
//   'name'     … 氏名6フィールド（結合値が正）。まとめて name-utils 経由で書き込む。
//   'field'    … null 許容の文字列フィールド（空欄→null）。
//   'required' … 空にできないフィールド（空欄なら更新時は据え置き、新規作成時はエラー）。
//   'email'    … メール形式を検証（空欄→null）。
//   'types'    … 顧客種別（ラベル区切り⇔JSON配列）。
//   'int'      … 整数（訪問頻度）。
//   'active'   … 有効/無効。
//   'store'    … 担当店舗（店舗コードで指定）。
//   'ref'      … 参照専用（エクスポートのみ。インポートでは無視）。
//
// 身分証・OCR・顔写真などの本人確認関連は、共有先が広がりうるシートには出さない方針のため
// 意図的に対象外にしている（システム上でのみ参照する）。
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, type CustomerType } from './customer-types'

export type CustomerSheetColumnKind =
  | 'key' | 'name' | 'field' | 'required' | 'email' | 'types' | 'int' | 'active' | 'store' | 'ref'
export type CustomerSheetColumn = { key: string; header: string; kind: CustomerSheetColumnKind }

export const CUSTOMER_SHEET_COLUMNS: CustomerSheetColumn[] = [
  { key: 'id',                   header: '顧客ID',           kind: 'key' },
  { key: 'lastName',             header: '姓',               kind: 'name' },
  { key: 'firstName',            header: '名',               kind: 'name' },
  { key: 'lastNameKana',         header: '姓（ふりがな）',   kind: 'name' },
  { key: 'firstNameKana',        header: '名（ふりがな）',   kind: 'name' },
  { key: 'email',                header: 'メールアドレス',   kind: 'email' },
  { key: 'phone',                header: '電話番号',         kind: 'required' },
  { key: 'phone2',               header: '電話番号2',        kind: 'field' },
  { key: 'phone3',               header: '電話番号3',        kind: 'field' },
  { key: 'address',              header: '住所',             kind: 'required' },
  { key: 'customerTypes',        header: '顧客種別',         kind: 'types' },
  { key: 'visitFrequencyMonths', header: '訪問頻度（ヶ月）', kind: 'int' },
  { key: 'occupation',           header: '職業',             kind: 'field' },
  { key: 'leadSource',           header: '流入経路',         kind: 'field' },
  { key: 'storeCode',            header: '担当店舗コード',   kind: 'store' },
  { key: 'bankName',             header: '銀行名',           kind: 'field' },
  { key: 'branchName',           header: '支店名',           kind: 'field' },
  { key: 'accountType',          header: '口座種別',         kind: 'field' },
  { key: 'accountNumber',        header: '口座番号',         kind: 'field' },
  { key: 'accountHolder',        header: '口座名義',         kind: 'field' },
  { key: 'internalNote',         header: '内部メモ',         kind: 'field' },
  { key: 'isActive',             header: '状態',             kind: 'active' },
  // 以下は参照専用（インポートでは変更しない）
  { key: 'name',                 header: '氏名',             kind: 'ref' },
  { key: 'furigana',             header: 'ふりがな',         kind: 'ref' },
  { key: 'storeName',            header: '担当店舗名',       kind: 'ref' },
  { key: 'birthDate',            header: '生年月日',         kind: 'ref' },
  { key: 'createdAt',            header: '登録日',           kind: 'ref' },
]

const TYPE_FROM_LABEL: Record<string, CustomerType> = Object.fromEntries(
  CUSTOMER_TYPES.flatMap(t => [[CUSTOMER_TYPE_LABEL[t], t], [t, t]]),
) as Record<string, CustomerType>

/** 顧客種別のセル値（ラベル/キーの区切り文字列）→ 有効なキー配列（不明値は無視） */
export function customerTypesFromCell(cell: string): CustomerType[] {
  const parts = (cell || '').split(/[・,、/／\s]+/).map(s => s.trim()).filter(Boolean)
  const keys = parts.map(s => TYPE_FROM_LABEL[s]).filter((k): k is CustomerType => !!k)
  return [...new Set(keys)]
}

/** 顧客種別のJSON配列 → ラベル表示（一覧CSVと同じ「・」区切り） */
export function customerTypesLabel(json: string | null | undefined, primary?: string | null): string {
  let arr: unknown = []
  if (json) { try { arr = JSON.parse(json) } catch { arr = [] } }
  let list = Array.isArray(arr) ? arr.filter((v): v is CustomerType => CUSTOMER_TYPES.includes(v)) : []
  if (list.length === 0 && primary && CUSTOMER_TYPES.includes(primary as CustomerType)) {
    list = [primary as CustomerType]
  }
  return list.map(t => CUSTOMER_TYPE_LABEL[t]).join('・')
}

/** 状態セル（有効/無効）→ boolean。空欄・不明値は undefined（変更しない） */
export function activeFromCell(cell: string): boolean | undefined {
  const t = (cell || '').trim()
  if (!t) return undefined
  if (['有効', 'true', '1', 'TRUE', 'yes', '○', '◯'].includes(t)) return true
  if (['無効', 'false', '0', 'FALSE', 'no', '×', '✕'].includes(t)) return false
  return undefined
}

/** 電話番号のセル値を正規化（ハイフン・空白を除去。管理APIと同じ扱い） */
export function normalizePhoneCell(cell: string): string {
  return (cell || '').replace(/[-ー\s]/g, '').trim()
}
