/**
 * 古物台帳のデータ取得（DBアクセス側）。純ロジックは kobutsu-ledger.ts に置く。
 *
 * 台帳の1行 = 「売買契約書が発行された案件（または訪問）の買取品目1点」。
 * 取引年月日は売買契約の締結日時（SalesContract.agreedAt）を使う。
 */
import { prisma } from '@/lib/prisma'
import {
  groupLedgerRows,
  type KobutsuLedgerGroup,
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

/** 契約書のPDF本文は絶対に select しない（巨大なため） */
const CONTRACT_SELECT = {
  id: true,
  agreedAt: true,
  dealId: true,
  visitScheduleId: true,
  deal: {
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

  if (contracts.length === 0) return { rows: [], truncated: false }

  const dealIds = contracts.map(c => c.dealId).filter((v): v is string => !!v)
  const visitIds = contracts
    .filter(c => !c.dealId)
    .map(c => c.visitScheduleId)
    .filter((v): v is string => !!v)

  const items = await prisma.purchaseItem.findMany({
    where: {
      OR: [
        ...(dealIds.length > 0 ? [{ dealId: { in: dealIds } }] : []),
        ...(visitIds.length > 0 ? [{ dealId: null, visitScheduleId: { in: visitIds } }] : []),
      ],
    },
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
      const entry = item.kobutsuEntry
      const manualCategory = isKobutsuCategoryKey(entry?.kobutsuCategory) ? entry!.kobutsuCategory as any : null
      const categoryKey = manualCategory ?? guessKobutsuCategory(item.category, item.itemName, item.notes)
      const manualFeatures = entry?.features?.trim() || null
      const features = manualFeatures ?? buildFeatures(item)

      const base = {
        id: item.id,
        contractId: contract.id,
        dealId: item.dealId,
        visitScheduleId: item.visitScheduleId,
        tradedAt: contract.agreedAt.toISOString(),
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
          age: ageAt(user.birthDate || user.idBirthDate, contract.agreedAt),
          verification: verificationMethod(user),
        },
      }

      if (q) {
        const hay = [
          base.itemName, base.features, base.customer.name,
          base.internalCategory ?? '', base.note ?? '',
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) continue
      }

      rows.push({ ...base, missing: findMissingFields(base) })
    }
  }

  const truncated = rows.length > limit
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated }
}

/**
 * 契約1件分の台帳（明細つき）を取得する。詳細画面用。
 * 他店舗の契約は null を返す（storeId で絞り込むため）。
 */
export async function fetchKobutsuLedgerGroup(
  contractId: string,
  storeId: string,
): Promise<KobutsuLedgerGroup | null> {
  const contract = await prisma.salesContract.findFirst({
    where: { id: contractId, OR: [{ deal: { storeId } }, { visitSchedule: { storeId } }] },
    select: { agreedAt: true },
  })
  if (!contract) return null

  // 期間を「その契約の締結日時ちょうど」に絞って共通処理を使い回す
  const { rows } = await fetchKobutsuLedgerRows({
    storeId,
    from: contract.agreedAt,
    to: contract.agreedAt,
    limit: 1000,
  })
  const groups = groupLedgerRows(rows.filter(r => r.contractId === contractId), { includeRows: true })
  return groups[0] ?? null
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
