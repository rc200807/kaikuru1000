// 店舗メンバーへの行動帰属クエリヘルパー。
//
// 2026-07 の memberId 導入以前のデータは名前文字列スナップショット
// （VisitSchedule.staffName / Deal.createdByName / Estimate.staffName / AccessLog.userName）
// しか持たないため、「memberId 一致 OR（memberId未設定 かつ 同店舗 かつ 名前一致）」の
// ハイブリッド条件で吸収する。名前照合は参考値（同名別人・改名で誤差が出うる）。

export type MemberRef = {
  id: string
  storeId: string
  name: string
}

/** 訪問（VisitSchedule）の帰属条件 */
export function visitWhereForMember(m: MemberRef): any {
  return {
    OR: [
      { memberId: m.id },
      { memberId: null, storeId: m.storeId, staffName: m.name.trim() },
    ],
  }
}

/** 案件（Deal）の帰属条件 */
export function dealWhereForMember(m: MemberRef): any {
  return {
    OR: [
      { memberId: m.id },
      { memberId: null, storeId: m.storeId, createdByType: 'store', createdByName: m.name.trim() },
    ],
  }
}

/** 見積（Estimate）の帰属条件。店舗照合は visitSchedule リレーション経由 */
export function estimateWhereForMember(m: MemberRef): any {
  return {
    OR: [
      { memberId: m.id },
      { memberId: null, staffName: m.name.trim(), visitSchedule: { storeId: m.storeId } },
    ],
  }
}

/** アクセスログ（AccessLog）の帰属条件 */
export function accessLogWhereForMember(m: MemberRef): any {
  return {
    OR: [
      { memberId: m.id },
      { memberId: null, userType: 'store', userId: m.storeId, userName: m.name.trim() },
    ],
  }
}
