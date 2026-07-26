// 店舗情報CSV（エクスポート/インポート共通）の列定義。
// エクスポートはこの順序・見出しで出力し、インポートは同じ見出しで解釈する（往復可能）。
// kind:
//   'key'    … 既存店舗の突合キー（店舗コード）。更新対象ではない。空欄なら新規作成。
//   'field'  … そのまま Store フィールドに設定（空欄→null）。
//   'status' … 営業ステータス（ラベル⇔値を変換）。
//   'date'   … 日付（YYYY-MM-DD）。
//   'services' … 対応サービス（ラベル区切り⇔JSON配列を変換）。
//   'ref'    … 参照専用（エクスポートのみ。インポートでは無視）。
import { STORE_STATUSES } from './store-status'

export type StoreCsvColumnKind = 'key' | 'field' | 'status' | 'date' | 'services' | 'ref'
export type StoreCsvColumn = { key: string; header: string; kind: StoreCsvColumnKind }

export const STORE_CSV_COLUMNS: StoreCsvColumn[] = [
  { key: 'code',                header: '店舗コード',            kind: 'key' },
  { key: 'name',                header: '店舗名',                kind: 'field' },
  { key: 'storeStatus',         header: 'ステータス',            kind: 'status' },
  { key: 'postalCode',          header: '郵便番号',              kind: 'field' },
  { key: 'prefecture',          header: '都道府県',              kind: 'field' },
  { key: 'address',             header: '住所',                  kind: 'field' },
  { key: 'phone',               header: '電話番号',              kind: 'field' },
  { key: 'email',               header: 'メール',                kind: 'field' },
  { key: 'contractNotifyEmail', header: '契約通知メール',        kind: 'field' },
  { key: 'calendarInviteEmail', header: 'カレンダー招待メール',  kind: 'field' },
  { key: 'openingDate',         header: '開業日',                kind: 'date' },
  { key: 'closingDate',         header: '閉店日',                kind: 'date' },
  { key: 'googleBusinessUrl',   header: 'GoogleビジネスURL',     kind: 'field' },
  { key: 'oikuraPageUrl',       header: 'おいくらURL',           kind: 'field' },
  { key: 'lineAddFriendUrl',    header: 'LINE友達登録URL',       kind: 'field' },
  { key: 'bankName',            header: '銀行名',                kind: 'field' },
  { key: 'branchName',          header: '支店名',                kind: 'field' },
  { key: 'accountType',         header: '口座種別',              kind: 'field' },
  { key: 'accountNumber',       header: '口座番号',              kind: 'field' },
  { key: 'accountHolder',       header: '口座名義',              kind: 'field' },
  { key: 'invoiceNumber',       header: 'インボイス番号',        kind: 'field' },
  { key: 'antiquePermitNumber', header: '古物許可番号',          kind: 'field' },
  { key: 'serviceAreas',        header: '対応エリア(JSON)',      kind: 'field' },
  { key: 'supportedServices',   header: '対応サービス',          kind: 'services' },
  // 以下は参照専用（インポートでは変更しない）
  { key: 'operatorName',        header: '運営者名',              kind: 'ref' },
  { key: 'isActive',            header: '有効',                  kind: 'ref' },
  { key: 'customerCount',       header: '顧客数',                kind: 'ref' },
  { key: 'createdAt',           header: '登録日',                kind: 'ref' },
  { key: 'inquiryUrl',          header: '問い合わせフォームURL', kind: 'ref' },
]

const LABEL_TO_VALUE: Record<string, string> = Object.fromEntries(STORE_STATUSES.map(s => [s.label, s.value]))
const VALID_VALUES = new Set(STORE_STATUSES.map(s => s.value))

/**
 * ステータスのセル値（ラベル「営業中」または値「active」）→ 保存値。
 * 空欄は null。ラベルでも値でも受理。不明値は undefined（呼び出し側でエラー扱い）。
 */
export function storeStatusValueFromCell(cell: string): string | null | undefined {
  const t = (cell || '').trim()
  if (!t) return null
  if (LABEL_TO_VALUE[t]) return LABEL_TO_VALUE[t]
  if (VALID_VALUES.has(t)) return t
  return undefined
}
