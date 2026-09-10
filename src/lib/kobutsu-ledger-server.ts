/**
 * 古物台帳のデータ取得（DBアクセス側）。純ロジックは kobutsu-ledger.ts に置く。
 *
 * 台帳の1行 = 「取引が成立した案件（または訪問）の買取品目1点」。
 * 取引年月日は電子契約なら締結日時（SalesContract.agreedAt）、
 * 紙で契約した案件（写真のみ）なら Deal.paperContractAgreedAt（未入力なら訪問日・案件発生日）を使う。
 * 紙で契約しても古物営業法の記載義務は同じなので、台帳には必ず載せる。
 */
import { prisma } from '@/lib/prisma'
import {
  contractEntryKey,
  dealEntryKey,
  groupLedgerRows,
  parseEntryKey,
  type KobutsuLedgerGroup,
  type LedgerSource,
  ageAt,
  buildFeatures,
  findMissingFields,
  guessKobutsuCategory,
  isKobutsuCategoryKey,
  verificationMethod,
  type KobutsuLedgerRow,
} from '@/lib/kobutsu-ledger'

export type KobutsuLedgerQuery = {
  storeId: string
  /** 取引年月日の範囲（含む）。JSTの日付境界を呼び出し側で Date に変換して渡す */
  from?: Date | null
  to?: Date | null
  /** フリーワード（品名・特徴・顧客名） */
  q?: string | null
  limit?: number
}

/** 台帳に必要な顧客の項目（本人確認・法定記載事項） */
const LEDGER_USER_SELECT = {
  id: true, name: true, idName: true, address: true, idAddress: true, idBackAddress: true,
  occupation: true, birthDate: true, idBirthDate: true,
  idDocumentType: true, idDocumentPath: true, selfieImagePath: true,
} as const

/** 契約書のPDF本文は絶対に select しない（巨大なため） */
const CONTRACT_SELECT = {
  id: true,
  agreedAt: true,
  dealId: true,
  visitScheduleId: true,
  deal: {
    select: {
      id: true, storeId: true, dealNumber: true,
      user: {
        select: {
          id: true, name: true, idName: true, address: true, idAddress: true, idBackAddress: true,
          occupation: true, birthDate: true, idBirthDate: true,
          idDocumentType: true, idDocumentPath: true, selfieImagePath: true,
        },
      },
    },
  },
  visitSchedule: {
    select: {
      id: true, storeId: true,
      user: {
        select: {
          id: true, name: true, idName: true, address: true, idAddress: true, idBackAddress: true,
          occupation: true, birthDate: true, idBirthDate: true,
          idDocumentType: true, idDocumentPath: true, selfieImagePath: true,
        },
      },
    },
  },
} as const

type LedgerItem = {
  id: string
  dealId: string | null
  visitScheduleId: string | null
  itemName: string
  category: string
  quantity: number
  purchasePrice: number
  janCode: string | null
  notes: string | null
  kobutsuEntry: { kobutsuCategory: string | null; features: string | null; note: string | null } | null
}

type LedgerUser = {
  id: string
  name: string
  idName: string | null
  address: string
  idAddress: string | null
  idBackAddress: string | null
  occupation: string | null
  birthDate: string | null
  idBirthDate: string | null
  idDocumentType: string | null
  idDocumentPath: string | null
  selfieImagePath: string | null
}

/**
 * 買取品目1点を台帳の1行に変換する。
 * 電子契約・紙契約のどちらも同じ形にするため、取引年月日とキーは呼び出し側から渡す。
 */
function buildLedgerRow(args: {
  item: LedgerItem
  user: LedgerUser
  entryKey: string
  contractId: string | null
  source: LedgerSource
  dealNumber: string | null
  tradedAt: Date
}): KobutsuLedgerRow {
  const { item, user, tradedAt } = args
  const entry = item.kobutsuEntry
  const manualCategory = isKobutsuCategoryKey(entry?.kobutsuCategory) ? (entry!.kobutsuCategory as never) : null
  const categoryKey = manualCategory ?? guessKobutsuCategory(item.category, item.itemName, item.notes)
  const manualFeatures = entry?.features?.trim() || null
  const features = manualFeatures ?? buildFeatures(item)

  const base = {
    id: item.id,
    entryKey: args.entryKey,
    contractId: args.contractId,
    source: args.source,
    dealId: item.dealId,
    dealNumber: args.dealNumber,
    visitScheduleId: item.visitScheduleId,
    tradedAt: tradedAt.toISOString(),
    tradeType: '買受け' as const,
    categoryKey,
    categoryManual: !!manualCategory,
    internalCategory: item.category || null,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.purchasePrice,
    price: item.purchasePrice * item.quantity,
    features,
    featuresManual: !!manualFeatures,
    note: entry?.note?.trim() || null,
    customer: {
      id: user.id,
      // 身分証の記載を優先（本人確認書類と照合した値が台帳の正）
      name: user.idName || user.name,
      address: user.idBackAddress || user.idAddress || user.address || null,
      occupation: user.occupation || null,
      // 生年月日と年齢は必ず同じ値から導く（表示が食い違わないように）
      birthDate: user.birthDate || user.idBirthDate || null,
      age: ageAt(user.birthDate || user.idBirthDate, tradedAt),
      verification: verificationMethod(user),
    },
  }
  return { ...base, missing: findMissingFields(base) }
}

/** フリーワード検索（品名・特徴・顧客名・カテゴリ・備考） */
function matchesQuery(row: KobutsuLedgerRow, q: string): boolean {
  if (!q) return true
  return [row.itemName, row.features, row.customer.name, row.internalCategory ?? '', row.note ?? '']
    .join(' ').toLowerCase().includes(q)
}

/**
 * 紙で売買契約書を作成した案件（写真のみ・電子契約なし）の台帳行。
 *
 * 紙で契約した取引も古物営業法の記載義務は同じなので、写真をアップロードした案件は
 * 台帳の対象にする。取引年月日は Deal.paperContractAgreedAt を正とし、
 * 未入力のときは最新の訪問日 → 案件発生日 の順でフォールバックする
 * （案件詳細の古物台帳セクションからあとで入力できる）。
 */
async function fetchPaperContractRows(args: {
  storeId: string
  from?: Date | null
  to?: Date | null
  q: string
}): Promise<KobutsuLedgerRow[]> {
  const { storeId, from, to, q } = args

  const deals = await prisma.deal.findMany({
    where: {
      storeId,
      // 電子の売買契約書がある案件は契約側で拾うので除外する
      salesContract: null,
      // 紙契約の写真がある案件だけ（"[]" は空）
      NOT: { paperContractImages: '[]' },
    },
    select: {
      id: true, dealNumber: true, occurredAt: true, paperContractAgreedAt: true,
      paperContractImages: true,
      user: { select: LEDGER_USER_SELECT },
      visitSchedules: { orderBy: { visitDate: 'desc' }, take: 1, select: { id: true, visitDate: true } },
      purchaseItems: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, dealId: true, visitScheduleId: true,
          itemName: true, category: true, quantity: true, purchasePrice: true,
          janCode: true, notes: true,
          kobutsuEntry: { select: { kobutsuCategory: true, features: true, note: true } },
        },
      },
    },
  })

  const rows: KobutsuLedgerRow[] = []
  for (const deal of deals) {
    // paperContractImages は JSON 文字列。空配列の案件は対象外
    let images: string[] = []
    try { images = JSON.parse(deal.paperContractImages || '[]') } catch { /* ignore */ }
    if (images.length === 0) continue
    if (deal.purchaseItems.length === 0) continue

    const tradedAt = deal.paperContractAgreedAt
      ?? deal.visitSchedules[0]?.visitDate
      ?? deal.occurredAt
    // 期間フィルタは取引年月日で判定する（DB側で絞れないためここで弾く）
    if (from && tradedAt < from) continue
    if (to && tradedAt > to) continue

    for (const item of deal.purchaseItems) {
      const row = buildLedgerRow({
        item: item as LedgerItem,
        user: deal.user as LedgerUser,
        entryKey: dealEntryKey(deal.id),
        contractId: null,
        source: 'paper',
        dealNumber: deal.dealNumber,
        tradedAt,
      })
      if (matchesQuery(row, q)) rows.push(row)
    }
  }
  return rows
}

export async function fetchKobutsuLedgerRows(
  query: KobutsuLedgerQuery,
): Promise<{ rows: KobutsuLedgerRow[]; truncated: boolean }> {
  const { storeId, from, to } = query
  const limit = Math.max(1, Math.min(query.limit ?? 500, 5000))

  const agreedAt: { gte?: Date; lte?: Date } = {}
  if (from) agreedAt.gte = from
  if (to) agreedAt.lte = to

  const contracts = await prisma.salesContract.findMany({
    where: {
      ...(from || to ? { agreedAt } : {}),
      // 案件経由・訪問経由のどちらでも自店舗の契約だけを対象にする
      OR: [{ deal: { storeId } }, { visitSchedule: { storeId } }],
    },
    orderBy: { agreedAt: 'desc' },
    select: CONTRACT_SELECT,
    // 1契約に複数品目が付くため、行数上限より少なめの契約数で足切りしない。
    // 上限は品目に展開したあとで適用する
    take: limit,
  })

  // 電子契約が0件でも紙契約の案件は台帳に載るため、ここで打ち切らない
  const dealIds = contracts.map(c => c.dealId).filter((v): v is string => !!v)
  const visitIds = contracts
    .filter(c => !c.dealId)
    .map(c => c.visitScheduleId)
    .filter((v): v is string => !!v)

  const itemOr = [
    ...(dealIds.length > 0 ? [{ dealId: { in: dealIds } }] : []),
    ...(visitIds.length > 0 ? [{ dealId: null, visitScheduleId: { in: visitIds } }] : []),
  ]
  const items = itemOr.length === 0 ? [] : await prisma.purchaseItem.findMany({
    where: { OR: itemOr },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, dealId: true, visitScheduleId: true,
      itemName: true, category: true, quantity: true, purchasePrice: true,
      janCode: true, notes: true,
      kobutsuEntry: { select: { kobutsuCategory: true, features: true, note: true } },
    },
  })

  // 品目を契約（案件/訪問）に割り当てる
  const byDeal = new Map<string, typeof items>()
  const byVisit = new Map<string, typeof items>()
  for (const item of items) {
    if (item.dealId) {
      const list = byDeal.get(item.dealId) ?? []
      list.push(item)
      byDeal.set(item.dealId, list)
    } else if (item.visitScheduleId) {
      const list = byVisit.get(item.visitScheduleId) ?? []
      list.push(item)
      byVisit.set(item.visitScheduleId, list)
    }
  }

  const q = (query.q ?? '').trim().toLowerCase()
  const rows: KobutsuLedgerRow[] = []

  for (const contract of contracts) {
    const owner = contract.deal ?? contract.visitSchedule
    const user = owner?.user
    if (!user) continue

    const contractItems = contract.dealId
      ? byDeal.get(contract.dealId) ?? []
      : contract.visitScheduleId ? byVisit.get(contract.visitScheduleId) ?? [] : []

    for (const item of contractItems) {
      const row = buildLedgerRow({
        item: item as LedgerItem,
        user: user as LedgerUser,
        entryKey: contractEntryKey(contract.id),
        contractId: contract.id,
        source: 'digital',
        dealNumber: contract.deal?.dealNumber ?? null,
        tradedAt: contract.agreedAt,
      })
      if (matchesQuery(row, q)) rows.push(row)
    }
  }

  // ── 紙で契約した案件（写真のみ・電子契約なし）も台帳に載せる ──
  // 取引年月日は Deal.paperContractAgreedAt が正。未入力なら最新の訪問日、
  // それも無ければ案件発生日で暫定表示し、案件詳細から入力できるようにする。
  const paperRows = await fetchPaperContractRows({ storeId, from, to, q })
  rows.push(...paperRows)
  // 取引年月日の降順に整える（契約側は取得時点で降順だが、紙契約を混ぜると崩れる）
  rows.sort((a, b) => new Date(b.tradedAt).getTime() - new Date(a.tradedAt).getTime())

  const truncated = rows.length > limit
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated }
}

/**
 * 契約1件分の台帳（明細つき）を取得する。詳細画面用。
 * 他店舗の契約は null を返す（storeId で絞り込むため）。
 */
export async function fetchKobutsuLedgerGroup(
  entryKey: string,
  storeId: string,
): Promise<KobutsuLedgerGroup | null> {
  const parsed = parseEntryKey(entryKey)

  // 取引年月日を先に求め、期間を「その日時ちょうど」に絞って共通処理を使い回す
  let tradedAt: Date | null = null
  if (parsed.kind === 'contract') {
    const contract = await prisma.salesContract.findFirst({
      where: { id: parsed.id, OR: [{ deal: { storeId } }, { visitSchedule: { storeId } }] },
      select: { agreedAt: true },
    })
    tradedAt = contract?.agreedAt ?? null
  } else {
    const deal = await prisma.deal.findFirst({
      where: { id: parsed.id, storeId },
      select: {
        occurredAt: true, paperContractAgreedAt: true,
        visitSchedules: { orderBy: { visitDate: 'desc' }, take: 1, select: { visitDate: true } },
      },
    })
    tradedAt = deal
      ? (deal.paperContractAgreedAt ?? deal.visitSchedules[0]?.visitDate ?? deal.occurredAt)
      : null
  }
  if (!tradedAt) return null

  const { rows } = await fetchKobutsuLedgerRows({
    storeId,
    from: tradedAt,
    to: tradedAt,
    limit: 1000,
  })
  const normalizedKey = parsed.kind === 'contract' ? contractEntryKey(parsed.id) : dealEntryKey(parsed.id)
  const groups = groupLedgerRows(rows.filter(r => r.entryKey === normalizedKey), { includeRows: true })
  return groups[0] ?? null
}


/**
 * 案件詳細の「古物台帳」セクションぶんをまとめて返す。
 *
 * 案件詳細GET（`/api/deals/[id]`）が**すでに取得している行から**組み立てられるよう、
 * 必要な項目を引数で受け取る形にしてある。専用エンドポイントを別に叩くと
 * 同じ案件をもう一度引いたうえで、日本からは 0.3 秒の往復がまるごと1本増える。
 */
export async function buildDealLedgerSection(deal: {
  id: string
  storeId: string | null
  paperContractImages: string | null
  paperContractAgreedAt: Date | null
  /** 案件直下の売買契約書ID（無ければ null） */
  contractId: string | null
  /** 案件に契約が直付けされていない旧データ用。訪問側の契約ID */
  visitContractIds: (string | null | undefined)[]
  store: { name: string; code: string; antiquePermitNumber: string | null } | null
}) {
  const empty = { group: null, entryKey: null, paperContract: null, store: null }
  // 担当店舗が未割当の案件は台帳（営業所単位）に載らない
  if (!deal.storeId) return empty

  // 電子の売買契約書があればそれが台帳のキー。無い場合でも、紙で契約した案件
  // （写真をアップロードした案件）は台帳の記載対象なので案件キーで引く。
  const contractId = deal.contractId ?? deal.visitContractIds.find((v): v is string => !!v) ?? null

  let paperImages: string[] = []
  try { const a = JSON.parse(deal.paperContractImages || '[]'); if (Array.isArray(a)) paperImages = a } catch { /* ignore */ }
  const hasPaperContract = paperImages.length > 0

  const entryKey = contractId
    ? contractEntryKey(contractId)
    : hasPaperContract ? dealEntryKey(deal.id) : null
  if (!entryKey) return empty

  const group = await fetchKobutsuLedgerGroup(entryKey, deal.storeId)
  return {
    group,
    entryKey,
    // 紙契約の場合、取引年月日は案件詳細から入力する（未入力なら訪問日・案件発生日で暫定表示）
    paperContract: contractId ? null : {
      agreedAt: deal.paperContractAgreedAt?.toISOString() ?? null,
      imageCount: paperImages.length,
    },
    store: deal.store
      ? { name: deal.store.name, code: deal.store.code, antiquePermitNumber: deal.store.antiquePermitNumber }
      : null,
  }
}

/**
 * 買取品目が自店舗のものか検証する（補記の保存前チェック）。
 * 品目 → 案件 or 訪問 → storeId を辿る。
 */
export async function purchaseItemBelongsToStore(purchaseItemId: string, storeId: string): Promise<boolean> {
  const item = await prisma.purchaseItem.findUnique({
    where: { id: purchaseItemId },
    select: {
      deal: { select: { storeId: true } },
      visitSchedule: { select: { storeId: true } },
    },
  })
  if (!item) return false
  return item.deal?.storeId === storeId || item.visitSchedule?.storeId === storeId
}
