// 案件一覧の絞り込み・ソート条件をURLクエリからPrisma条件に変換する共有ヘルパー。
// 案件一覧(/api/deals)・CSVエクスポート・一括操作で同じ条件解釈を共有する。
import { isDealStatus } from '@/lib/deal-status'
import { isDealCategory } from '@/lib/deal-categories'

/** JSTの日付文字列(YYYY-MM-DD)をその日の開始時刻(JST 00:00)のDateに変換 */
function jstDayStart(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const d = new Date(`${dateStr}T00:00:00+09:00`)
  return isNaN(d.getTime()) ? null : d
}

function csv(value: string | null): string[] {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean)
}

export type DealFilterOptions = {
  /** 管理者向けフィルタ（店舗指定など）を許可するか */
  admin: boolean
}

/**
 * URLSearchParams から案件一覧のAND条件配列を組み立てる。
 * 呼び出し側のベース条件（店舗スコープ等）には触れない。
 */
export function buildDealFilterConditions(searchParams: URLSearchParams, opts: DealFilterOptions): any[] {
  const and: any[] = []

  // フリー検索（顧客名・電話・案件メモ）
  const search = (searchParams.get('search') || '').trim()
  if (search) {
    const digits = search.replace(/[-ー\s]/g, '')
    and.push({ OR: [
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { phone: { contains: search } } },
      ...(digits && digits !== search ? [{ user: { phone: { contains: digits } } }] : []),
      { detail: { contains: search, mode: 'insensitive' } },
    ] })
  }

  // ステータス（複数可）。単数 status も後方互換で受ける
  const statuses = csv(searchParams.get('statuses'))
  const singleStatus = searchParams.get('status') || ''
  if (singleStatus && singleStatus !== 'all' && !statuses.includes(singleStatus)) statuses.push(singleStatus)
  const validStatuses = statuses.filter(isDealStatus)
  if (validStatuses.length > 0) and.push({ status: { in: validStatuses } })

  // カテゴリー（複数可）。単数 category も後方互換で受ける
  const categories = csv(searchParams.get('categories'))
  const singleCategory = searchParams.get('category') || ''
  if (singleCategory && singleCategory !== 'all' && !categories.includes(singleCategory)) categories.push(singleCategory)
  const validCategories = categories.filter(isDealCategory)
  if (validCategories.length > 0) and.push({ category: { in: validCategories } })

  // 顧客種別（user.customerType・複数可）
  const customerTypes = csv(searchParams.get('customerTypes'))
  if (customerTypes.length > 0) and.push({ user: { customerType: { in: customerTypes } } })

  // 流入経路（user.leadSource・複数可。"none"=未設定）
  const leadSources = csv(searchParams.get('leadSources'))
  if (leadSources.length > 0) {
    const or: any[] = []
    for (const ls of leadSources) {
      if (ls === 'none') or.push({ user: { leadSource: null } }, { user: { leadSource: '' } })
      else or.push({ user: { leadSource: ls } })
    }
    and.push({ OR: or })
  }

  // 担当メンバー（memberId・複数可）
  const members = csv(searchParams.get('members'))
  const singleMember = searchParams.get('memberId') || ''
  if (singleMember && !members.includes(singleMember)) members.push(singleMember)
  if (members.length > 0) and.push({ memberId: { in: members } })

  // 作成日（JST基準の期間）
  const createdFrom = searchParams.get('createdFrom')
  const createdTo = searchParams.get('createdTo')
  if (createdFrom) { const d = jstDayStart(createdFrom); if (d) and.push({ createdAt: { gte: d } }) }
  if (createdTo) { const d = jstDayStart(createdTo); if (d) and.push({ createdAt: { lt: new Date(d.getTime() + 86400000) } }) }

  // 成約日/案件発生日（occurredAt・JST期間）
  const occurredFrom = searchParams.get('occurredFrom')
  const occurredTo = searchParams.get('occurredTo')
  if (occurredFrom) { const d = jstDayStart(occurredFrom); if (d) and.push({ occurredAt: { gte: d } }) }
  if (occurredTo) { const d = jstDayStart(occurredTo); if (d) and.push({ occurredAt: { lt: new Date(d.getTime() + 86400000) } }) }

  // 買取金額レンジ
  const amountMin = parseInt(searchParams.get('amountMin') || '', 10)
  const amountMax = parseInt(searchParams.get('amountMax') || '', 10)
  if (!isNaN(amountMin)) and.push({ purchaseAmount: { gte: amountMin } })
  if (!isNaN(amountMax)) and.push({ purchaseAmount: { lte: amountMax } })

  // 契約書の有無
  const hasContract = searchParams.get('hasContract') || ''
  if (hasContract === 'yes') and.push({ salesContract: { isNot: null } })
  else if (hasContract === 'no') and.push({ salesContract: { is: null } })

  // 由来（inquiry=問い合わせ由来 / manual=手動作成）
  const source = searchParams.get('source') || ''
  if (source === 'inquiry') and.push({ NOT: { inquiryId: null } })
  else if (source === 'manual') and.push({ inquiryId: null })

  // 特定顧客の案件（顧客詳細からの遷移など）
  const userId = searchParams.get('userId') || ''
  if (userId) and.push({ userId })

  // 店舗（管理者のみ。unassigned=未割り当て。複数可）
  if (opts.admin) {
    const storeIds = csv(searchParams.get('storeIds'))
    const singleStore = searchParams.get('storeId') || ''
    if (singleStore && !storeIds.includes(singleStore)) storeIds.push(singleStore)
    if (storeIds.length > 0) {
      const or: any[] = []
      for (const sid of storeIds) {
        if (sid === 'unassigned') or.push({ storeId: null })
        else or.push({ storeId: sid })
      }
      and.push({ OR: or })
    }
  }

  return and
}

const SORTABLE_FIELDS = new Set(['createdAt', 'occurredAt', 'purchaseAmount'])
const DEFAULT_ORDER = [{ occurredAt: 'desc' }, { createdAt: 'desc' }]

/** sort=field:dir をPrismaのorderByに変換（ホワイトリスト外はdefault） */
export function parseDealSort(searchParams: URLSearchParams): any {
  const sort = searchParams.get('sort') || ''
  const [field, dir] = sort.split(':')
  if (!SORTABLE_FIELDS.has(field)) return DEFAULT_ORDER
  return { [field]: dir === 'desc' ? 'desc' : 'asc' }
}

/** 管理者向け案件一覧のwhere条件（一覧・CSV・一括で共用） */
export function buildAdminDealsWhere(searchParams: URLSearchParams): any {
  const and = buildDealFilterConditions(searchParams, { admin: true })
  return and.length > 0 ? { AND: and } : {}
}

/** URL・保存ビューで扱うフィルタキー（pageは含めない） */
export const DEAL_FILTER_PARAM_KEYS = [
  'search', 'statuses', 'categories', 'storeIds', 'customerTypes', 'leadSources',
  'members', 'createdFrom', 'createdTo', 'occurredFrom', 'occurredTo',
  'amountMin', 'amountMax', 'hasContract', 'source', 'sort',
] as const
