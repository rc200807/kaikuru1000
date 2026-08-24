// 顧客一覧の絞り込み・ソート条件をURLクエリからPrisma条件に変換する共有ヘルパー。
// 管理ポータル(/api/admin/users)・店舗ポータル(/api/stores/[id]/customers)・
// CSVエクスポート・一括操作APIで同じ条件解釈を共有する。

/** JSTの日付文字列(YYYY-MM-DD)をその日の開始時刻(JST 00:00)のDateに変換 */
function jstDayStart(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const d = new Date(`${dateStr}T00:00:00+09:00`)
  return isNaN(d.getTime()) ? null : d
}

/** カンマ区切りパラメータを配列に */
function csv(value: string | null): string[] {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean)
}

export type CustomerFilterOptions = {
  /** 管理者向けフィルタ（身分証・住所確認・口座・店舗など）を許可するか */
  admin: boolean
}

/**
 * URLSearchParams から顧客一覧のAND条件配列を組み立てる。
 * 呼び出し側のベース条件（storeId・mergedIntoUserId・isActive）には触れない。
 */
export function buildCustomerFilterConditions(
  searchParams: URLSearchParams,
  opts: CustomerFilterOptions
): any[] {
  const and: any[] = []
  const now = new Date()

  // フリー検索（氏名・ふりがな・メール・電話）
  const search = (searchParams.get('search') || '').trim()
  if (search) {
    const digits = search.replace(/[-ー\s]/g, '')
    and.push({ OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { furigana: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      ...(digits && digits !== search ? [{ phone: { contains: digits } }] : []),
    ] })
  }

  // 顧客タイプ（複数可）。単数の customerType パラメータも後方互換で受ける
  const types = csv(searchParams.get('types'))
  const singleType = searchParams.get('customerType') || ''
  if (singleType && !types.includes(singleType)) types.push(singleType)
  if (types.length > 0) {
    and.push({ OR: types.flatMap(t => [
      { customerType: t },
      { customerTypes: { contains: `"${t}"` } },
    ]) })
  }

  // 流入経路（複数可。"none"=未設定）
  const leadSources = csv(searchParams.get('leadSources'))
  if (leadSources.length > 0) {
    const or: any[] = []
    for (const ls of leadSources) {
      if (ls === 'none') or.push({ leadSource: null }, { leadSource: '' })
      else or.push({ leadSource: ls })
    }
    and.push({ OR: or })
  }

  // 登録日（JST基準の期間指定）
  const createdFrom = searchParams.get('createdFrom')
  const createdTo = searchParams.get('createdTo')
  if (createdFrom) {
    const d = jstDayStart(createdFrom)
    if (d) and.push({ createdAt: { gte: d } })
  }
  if (createdTo) {
    const d = jstDayStart(createdTo)
    if (d) and.push({ createdAt: { lt: new Date(d.getTime() + 24 * 60 * 60 * 1000) } })
  }

  // 最終訪問（never=訪問実績なし / over90・over180=指定日数以内に訪問なし）
  const lastVisit = searchParams.get('lastVisit') || ''
  if (lastVisit === 'never') {
    // 訪問レコードもインポート由来の最終訪問日も無い顧客
    and.push({ visitSchedules: { none: { visitDate: { lt: now }, status: { not: 'cancelled' } } } })
    and.push({ lastVisitedAt: null })
  } else if (lastVisit === 'over90' || lastVisit === 'over180') {
    const days = lastVisit === 'over90' ? 90 : 180
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    and.push({ visitSchedules: { none: { visitDate: { gte: since, lt: now }, status: { not: 'cancelled' } } } })
    and.push({ OR: [{ lastVisitedAt: null }, { lastVisitedAt: { lt: since } }] })
  }

  // 次回訪問予定（none=なし / has=あり / 7d・30d=期間内にあり）
  const nextVisit = searchParams.get('nextVisit') || ''
  if (nextVisit === 'none') {
    and.push({ visitSchedules: { none: { visitDate: { gte: now }, status: 'scheduled' } } })
  } else if (nextVisit === 'has') {
    and.push({ visitSchedules: { some: { visitDate: { gte: now }, status: 'scheduled' } } })
  } else if (nextVisit === '7d' || nextVisit === '30d') {
    const days = nextVisit === '7d' ? 7 : 30
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    and.push({ visitSchedules: { some: { visitDate: { gte: now, lte: until }, status: 'scheduled' } } })
  }

  // 訪問頻度（複数可）
  const freq = csv(searchParams.get('freq')).map(v => parseInt(v, 10)).filter(n => !isNaN(n))
  if (freq.length > 0) {
    and.push({ visitFrequencyMonths: { in: freq } })
  }

  // 都道府県（住所の前方一致）
  const prefecture = searchParams.get('prefecture') || ''
  if (prefecture) {
    and.push({ address: { startsWith: prefecture } })
  }

  if (opts.admin) {
    // 顧客タグ（複数可＝いずれかを持つ。"none"=タグなし）
    const tags = csv(searchParams.get('tags'))
    if (tags.length > 0) {
      const or: any[] = []
      const labels = tags.filter(t => t !== 'none')
      if (labels.length > 0) or.push({ customerTags: { some: { label: { in: labels } } } })
      if (tags.includes('none')) or.push({ customerTags: { none: {} } })
      and.push({ OR: or })
    }

    // 身分証明書の提出状況
    const idDoc = searchParams.get('idDoc') || ''
    if (idDoc === 'missing') and.push({ idDocumentPath: null })
    else if (idDoc === 'submitted') and.push({ NOT: { idDocumentPath: null } })

    // 住所確認ステータス
    const addrVerify = searchParams.get('addrVerify') || ''
    if (addrVerify === 'verified') and.push({ addressVerified: true })
    else if (addrVerify === 'mismatch') and.push({ addressMismatch: true })
    else if (addrVerify === 'pending') and.push({ proofDocumentStatus: 'pending' })

    // 振込先口座の有無
    const bank = searchParams.get('bank') || ''
    if (bank === 'has') and.push({ NOT: { accountNumber: null } })
    else if (bank === 'none') and.push({ accountNumber: null })
  }

  return and
}

const SORTABLE_FIELDS = new Set(['createdAt', 'furigana', 'name'])

/** sort=field:dir をPrismaのorderByに変換（ホワイトリスト外はdefaultを返す） */
export function parseCustomerSort(
  searchParams: URLSearchParams,
  defaultOrderBy: any
): any {
  const sort = searchParams.get('sort') || ''
  const [field, dir] = sort.split(':')
  if (!SORTABLE_FIELDS.has(field)) return defaultOrderBy
  return { [field]: dir === 'desc' ? 'desc' : 'asc' }
}

/** 管理者向け顧客一覧のwhere条件（一覧・CSVエクスポート・一括操作で共用） */
export function buildAdminUsersWhere(searchParams: URLSearchParams): any {
  const includeInactive = searchParams.get('includeInactive') === 'true'
  const storeId = searchParams.get('storeId') || ''

  const where: any = { mergedIntoUserId: null } // 統合で吸収された顧客は一覧に出さない
  if (!includeInactive) where.isActive = true
  // 担当店舗フィルタ（unassigned=未割り当て）
  if (storeId === 'unassigned') where.storeId = null
  else if (storeId) where.storeId = storeId

  const and = buildCustomerFilterConditions(searchParams, { admin: true })
  if (and.length > 0) where.AND = and
  return where
}

/** 店舗向け担当顧客一覧のwhere条件（一覧・CSVエクスポート・一括操作で共用） */
export function buildStoreCustomersWhere(storeId: string, searchParams: URLSearchParams): any {
  const where: any = { storeId, mergedIntoUserId: null } // 統合で吸収された顧客は一覧に出さない
  const and = buildCustomerFilterConditions(searchParams, { admin: false })
  if (and.length > 0) where.AND = and
  return where
}

/** フィルタとして受け付けるクエリキー（保存ビュー・URL同期の対象） */
export const CUSTOMER_FILTER_KEYS = [
  'search', 'types', 'leadSources', 'createdFrom', 'createdTo',
  'lastVisit', 'nextVisit', 'freq', 'prefecture', 'sort',
  'storeId', 'includeInactive', 'idDoc', 'addrVerify', 'bank', 'tags',
] as const
