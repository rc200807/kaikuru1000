// 顧客一覧CSVエクスポートの共通処理（管理・店舗ポータル共用）
import { formatJstDate, jstDateKey } from '@/lib/datetime'
import { CUSTOMER_TYPE_LABEL, parseCustomerTypes } from '@/lib/customer-types'

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export type CsvCustomer = {
  name: string
  furigana: string
  email: string | null
  phone: string
  address: string
  customerType: string
  customerTypes?: string | null
  visitFrequencyMonths: number
  leadSource?: string | null
  createdAt: Date
  store?: { name: string } | null
}

/** 顧客配列をBOM付きCSV文字列に変換（Excelでの文字化け防止） */
export function customersToCsv(customers: CsvCustomer[], opts: { includeStore: boolean }): string {
  const header = [
    '氏名', 'ふりがな', 'メールアドレス', '電話番号', '住所',
    'タイプ', '訪問頻度（ヶ月）', '流入経路',
    ...(opts.includeStore ? ['担当店舗'] : []),
    '登録日',
  ]
  const rows = customers.map(c => {
    const types = parseCustomerTypes(c.customerTypes ?? undefined, c.customerType)
    const typeLabels = (types.length > 0 ? types : [c.customerType])
      .map(t => CUSTOMER_TYPE_LABEL[t as keyof typeof CUSTOMER_TYPE_LABEL] ?? t)
      .join('・')
    return [
      c.name,
      c.furigana,
      c.email || '',
      c.phone,
      c.address,
      typeLabels,
      String(c.visitFrequencyMonths ?? ''),
      c.leadSource || '',
      ...(opts.includeStore ? [c.store?.name || '未割り当て'] : []),
      formatJstDate(c.createdAt, { year: 'numeric', month: '2-digit', day: '2-digit' }),
    ].map(csvEscape).join(',')
  })
  return '\uFEFF' + [header.map(csvEscape).join(','), ...rows].join('\r\n')
}

export function csvFileName(prefix: string): string {
  return `${prefix}_${jstDateKey(new Date()).replace(/-/g, '')}.csv`
}

/** CSVエクスポートの上限件数 */
export const CSV_EXPORT_LIMIT = 5000
