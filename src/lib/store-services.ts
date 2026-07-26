/**
 * 店舗の対応サービス（買いクル/アキクル）の中央定義。
 * キー・ラベルは運営者の対応サービス（operator-utils.ts）を単一ソースとして再利用する。
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */
import {
  OPERATOR_SUPPORTED_SERVICE_KEYS,
  OPERATOR_SUPPORTED_SERVICE_LABEL,
  parseSupportedServices,
  type OperatorSupportedServiceKey,
} from '@/lib/operator-utils'

export const STORE_SERVICE_KEYS = OPERATOR_SUPPORTED_SERVICE_KEYS
export type StoreServiceKey = OperatorSupportedServiceKey
export const STORE_SERVICE_LABEL = OPERATOR_SUPPORTED_SERVICE_LABEL

export const STORE_SERVICES = STORE_SERVICE_KEYS.map(key => ({
  key, label: STORE_SERVICE_LABEL[key],
}))

/** バッジ色（deal-categories.ts の配色トーンに合わせる） */
export const STORE_SERVICE_BADGE: Record<StoreServiceKey, { bg: string; fg: string }> = {
  kaikuru: { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
  akikuru: { bg: 'rgba(251,191,36,0.15)', fg: '#b45309' },
}

/** JSON文字列 → 有効キーのみの配列 */
export const parseStoreServices = parseSupportedServices

/** 配列 → 正規化済みJSON文字列（定義順・重複除去・不明キー除外） */
export function stringifyStoreServices(keys: readonly string[] | null | undefined): string {
  if (!keys || !Array.isArray(keys)) return '[]'
  const normalized = STORE_SERVICE_KEYS.filter(k => keys.includes(k))
  return JSON.stringify(normalized)
}

/** 店舗がアキクルに対応しているか */
export function storeSupportsAkikuru(json: string | null | undefined): boolean {
  return parseStoreServices(json).includes('akikuru')
}

/** 表示用: "買いクル、アキクル" のようなラベル連結（CSV等で使用） */
export function storeServicesLabel(json: string | null | undefined): string {
  return parseStoreServices(json).map(k => STORE_SERVICE_LABEL[k]).join('、')
}

/** CSVセル（ラベル or キーの読点/カンマ/パイプ区切り）→ 正規化JSON文字列。不正値は無視 */
export function storeServicesValueFromCell(cell: string): string {
  const parts = cell.split(/[、,|/／\s]+/).map(p => p.trim()).filter(Boolean)
  const keys = new Set<StoreServiceKey>()
  for (const p of parts) {
    const byKey = STORE_SERVICE_KEYS.find(k => k === p)
    if (byKey) { keys.add(byKey); continue }
    const byLabel = STORE_SERVICE_KEYS.find(k => STORE_SERVICE_LABEL[k] === p)
    if (byLabel) keys.add(byLabel)
  }
  return stringifyStoreServices([...keys])
}
