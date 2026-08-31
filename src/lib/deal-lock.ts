/**
 * 売買契約書の発行後に、案件の「取引内容」を凍結するための中央定義。
 *
 * 契約書はお客様の署名つきで発行される確定書類なので、発行後に買取品目・請求項目・
 * 上乗せ率・事前同意が書き換わると、書類と DB の内容がずれてしまう。
 * ここで「案件が契約済みか」を1か所に集約し、UI（DealDetailView）と
 * 書き込みAPIの両方から同じ判定を使う。
 *
 * 凍結する対象:
 *   買取品目 / 請求項目 の 追加・更新・削除、買取金額の上乗せ率、事前同意の署名
 * 凍結しない対象（契約後の後続作業なので触れる）:
 *   在庫化、AI市場調査、古物台帳の補記、紙契約書の写真、会話の録音、案件ステータス・カテゴリー
 */
import { prisma } from './prisma'

export const DEAL_LOCKED_MESSAGE = '売買契約書が発行済みのため、取引内容は編集できません'

/**
 * 案件に売買契約書が発行済みかを判定する。
 * 契約は案件（dealId）に1通が正だが、再ペアレント前の古いデータは訪問（visitScheduleId）に
 * ぶら下がっているため、案件配下の訪問経由も見る。
 */
export async function isDealContracted(dealId: string | null | undefined): Promise<boolean> {
  if (!dealId) return false
  const contract = await prisma.salesContract.findFirst({
    where: { OR: [{ dealId }, { visitSchedule: { dealId } }] },
    select: { id: true },
  })
  return !!contract
}

/**
 * 品目（買取品目・請求項目）の親が契約済みかを判定する。
 * 品目は案件配下が正だが、再ペアレント前のデータは訪問配下にあるため両方をたどる。
 */
export async function isItemParentContracted(item: {
  dealId: string | null
  visitScheduleId: string | null
}): Promise<boolean> {
  if (item.dealId) return isDealContracted(item.dealId)
  if (!item.visitScheduleId) return false
  const contract = await prisma.salesContract.findFirst({
    where: { visitScheduleId: item.visitScheduleId },
    select: { id: true },
  })
  return !!contract
}
