/**
 * 空き家管理項目の既定リストと共通ヘルパー。
 * 管理項目マスタ（AkiyaManagementItem）が空のとき、この既定11項目を遅延シードする。
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */
export const DEFAULT_AKIYA_MANAGEMENT_ITEMS = [
  '郵便受けの確認',
  '簡易掃除',
  '建物外部目視確認',
  '庭木の確認',
  '防犯面の確認',
  '全室換気',
  '通水',
  '屋内簡易清掃',
  '雨漏り・カビ確認',
  '室内防犯確認',
  '総合的な状況報告',
] as const

/** 1項目あたりの写真枚数上限 */
export const AKIYA_ITEM_PHOTO_LIMIT = 10
/** 物件写真の枚数上限 */
export const AKIYA_CASE_PHOTO_LIMIT = 20

/** photoUrls JSON文字列 → URL配列（不正値は空配列） */
export function parsePhotoUrls(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
