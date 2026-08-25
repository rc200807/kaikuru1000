// 案件の担当者まわりの中央定義。
//
// 経緯: 案件の担当者は歴史的に2か所に分かれている。
//   - Deal.memberId … 店舗メンバーへのリレーション。案件一覧の「担当」列・担当フィルター・
//                     一括「担当変更」・CSV はすべてこちらを見る
//   - VisitSchedule.staffName … 訪問ごとの担当者名（自由文字列）。案件詳細の「担当者」および
//                     売買契約書・見積書の担当者欄はこちらを使う
// 案件詳細から担当者を設定すると staffName にしか入らないため、一覧の「担当」が「—」のまま
// になっていた。ここに以下を集約して両者を突き合わせる。
//   - 書き込み時: 担当者名が店舗メンバーと一致すれば Deal.memberId にも反映する
//   - 表示時:     Deal.memberId が無い案件は訪問の担当者名で補完して表示する
//                 （メンバーに紐づかない自由入力の名前・過去データの救済）
import { prisma } from './prisma'

/** 担当者名から店舗メンバーを解決する（同一店舗内・前後の空白は無視した完全一致） */
export async function resolveMemberIdByStaffName(
  storeId: string | null | undefined,
  staffName: string | null | undefined,
): Promise<string | null> {
  const name = (staffName ?? '').trim()
  if (!storeId || !name) return null
  const member = await prisma.storeMember.findFirst({
    where: { storeId, name },
    select: { id: true },
  })
  return member?.id ?? null
}

/**
 * 訪問の担当者を設定・変更したときに、案件の担当者（Deal.memberId）へ反映する。
 * 名前が店舗メンバーと一致しない場合（外注・退職者など自由入力の名前）は案件側を変更しない。
 * その場合も一覧では fetchVisitStaffNames() のフォールバックで担当者名が表示される。
 * 担当を外す操作は一覧の一括「担当変更（担当解除）」に任せ、ここでは決してクリアしない
 * （1案件に複数の訪問がぶら下がるため、1件の担当者を空にしただけで案件の担当を消すのは危険）。
 */
export async function syncDealAssigneeFromVisit(
  dealId: string | null | undefined,
  storeId: string | null | undefined,
  staffName: string | null | undefined,
): Promise<void> {
  if (!dealId) return
  const memberId = await resolveMemberIdByStaffName(storeId, staffName)
  if (!memberId) return
  try {
    await prisma.deal.update({ where: { id: dealId }, data: { memberId } })
  } catch (e) {
    // 担当者の反映に失敗しても訪問の保存自体は成功として扱う
    console.error('[deal-assignee] 案件担当者の反映に失敗:', e)
  }
}

/**
 * Deal.memberId が未設定の案件について、訪問の担当者名を引いて補完する。
 * 直近の訪問（visitDate の新しい順で最初に見つかったもの）の担当者名を採用する。
 */
export async function fetchVisitStaffNames(dealIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (dealIds.length === 0) return out
  const rows = await prisma.visitSchedule.findMany({
    where: { dealId: { in: dealIds }, NOT: { staffName: null } },
    orderBy: { visitDate: 'desc' },
    select: { dealId: true, staffName: true },
  })
  for (const r of rows) {
    if (!r.dealId || out.has(r.dealId)) continue
    const name = (r.staffName ?? '').trim()
    if (name) out.set(r.dealId, name)
  }
  return out
}

/** 一覧・CSV 用に、担当者名（メンバー名 → 無ければ訪問の担当者名）を各案件に付与する */
export async function withAssigneeNames<
  T extends { id: string; memberId: string | null; member?: { name: string } | null },
>(deals: T[]): Promise<(T & { assigneeName: string | null })[]> {
  const missing = deals.filter(d => !d.member?.name).map(d => d.id)
  const staffNames = await fetchVisitStaffNames(missing)
  return deals.map(d => ({
    ...d,
    assigneeName: d.member?.name ?? staffNames.get(d.id) ?? null,
  }))
}
