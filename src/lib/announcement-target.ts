/**
 * お知らせの配信対象（対応サービス絞り込み）の中央定義。
 * - Announcement.targetServices は対応サービスキーのJSON配列文字列。"[]" = 全店舗へ配信
 * - 店舗の対応サービス（Store.supportedServices）と1つでも重なれば配信対象
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */
import {
  STORE_SERVICE_KEYS,
  STORE_SERVICE_LABEL,
  parseStoreServices,
  stringifyStoreServices,
  type StoreServiceKey,
} from '@/lib/store-services'

export type AnnouncementTargetServiceKey = StoreServiceKey

export const ANNOUNCEMENT_TARGET_SERVICE_KEYS = STORE_SERVICE_KEYS
export const ANNOUNCEMENT_TARGET_SERVICE_LABEL = STORE_SERVICE_LABEL

/** JSON文字列 → 有効キーのみの配列（不正値は全店舗扱いの空配列） */
export const parseAnnouncementTargets = parseStoreServices

/** 配列 → 正規化済みJSON文字列（定義順・重複除去・不明キー除外） */
export const stringifyAnnouncementTargets = stringifyStoreServices

/** 配信対象の表示ラベル。空 = 全店舗 */
export function announcementTargetLabel(json: string | null | undefined): string {
  const keys = parseAnnouncementTargets(json)
  if (keys.length === 0) return '全店舗'
  return `${keys.map(k => ANNOUNCEMENT_TARGET_SERVICE_LABEL[k]).join('・')}対応店舗`
}

/** この店舗が配信対象か（対象が空なら全店舗） */
export function matchesAnnouncementTarget(
  targetJson: string | null | undefined,
  storeServicesJson: string | null | undefined,
): boolean {
  const targets = parseAnnouncementTargets(targetJson)
  if (targets.length === 0) return true
  const services = parseStoreServices(storeServicesJson)
  return targets.some(t => services.includes(t))
}

/**
 * 店舗が閲覧できるお知らせに絞る Prisma where 条件。
 * JSON列の検索は DB 非依存にするため文字列 contains で行う
 * （targetServices は stringifyAnnouncementTargets で正規化済みなのでキーは必ず "key" 形式で入る）。
 */
export function announcementVisibilityWhere(storeServicesJson: string | null | undefined) {
  const services = parseStoreServices(storeServicesJson)
  return {
    OR: [
      // 全店舗向け（未設定・空配列）
      { targetServices: '[]' },
      { targetServices: '' },
      // 店舗の対応サービスがひとつでも含まれる
      ...services.map(key => ({ targetServices: { contains: `"${key}"` } })),
    ],
  }
}

/** 管理画面用: 配信対象に該当する店舗数を数える */
export function countTargetStores(
  targetJson: string | null | undefined,
  stores: readonly { supportedServices: string | null }[],
): number {
  const targets = parseAnnouncementTargets(targetJson)
  if (targets.length === 0) return stores.length
  return stores.filter(s => matchesAnnouncementTarget(targetJson, s.supportedServices)).length
}
