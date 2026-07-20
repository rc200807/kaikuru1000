// 分析APIの共通パラメータ解決（期間・比較・粒度・絞り込み）
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'
import {
  PRESETS, PresetKey, CompareMode, Granularity, DateRange,
  resolvePreset, resolveCompareRange, defaultGranularity, addDaysStr,
} from '@/lib/analytics/period'
import { DEAL_CATEGORIES } from '@/lib/deal-categories'
import { CUSTOMER_TYPES } from '@/lib/customer-types'
import type { AnalyticsResponse } from '@/lib/analytics/types'

export type AnalyticsFilters = {
  storeId: string | null
  dealCategory: string | null
  customerType: string | null
  leadSource: string | null
}

export type ResolvedParams = {
  preset: PresetKey
  range: DateRange
  compare: DateRange | null
  granularity: Granularity
  filters: AnalyticsFilters
}

/** 成約とみなす案件ステータス */
export const WON_STATUSES = ['contract', 'completed']
/** 失注とみなす案件ステータス（旧 'lost' も後方互換で含める） */
export const LOST_STATUSES = ['lost', 'lost_after_visit', 'lost_no_visit']

export async function resolveAnalyticsParams(request: NextRequest): Promise<ResolvedParams> {
  const sp = request.nextUrl.searchParams

  const presetRaw = sp.get('preset')
  const preset: PresetKey = (PRESETS as readonly string[]).includes(presetRaw ?? '') ? (presetRaw as PresetKey) : '30d'

  // 全期間はデータ最古日（顧客/案件の早い方）を開始日にする
  let allStartStr: string | undefined
  if (preset === 'all') {
    const [minUser, minDeal] = await Promise.all([
      prisma.user.aggregate({ _min: { createdAt: true } }),
      prisma.deal.aggregate({ _min: { occurredAt: true } }),
    ])
    const candidates = [minUser._min.createdAt, minDeal._min.occurredAt].filter((d): d is Date => d != null)
    if (candidates.length > 0) {
      allStartStr = jstDateKey(new Date(Math.min(...candidates.map(d => d.getTime()))))
    }
  }

  const range = resolvePreset(preset, { from: sp.get('from'), to: sp.get('to'), allStartStr })

  const compareRaw = sp.get('compare')
  const compareMode: CompareMode =
    preset === 'all' ? 'none' : compareRaw === 'year' ? 'year' : compareRaw === 'none' ? 'none' : 'prev'
  const compare = resolveCompareRange(range, compareMode)

  const granularityRaw = sp.get('granularity')
  const granularity: Granularity =
    granularityRaw === 'day' || granularityRaw === 'week' || granularityRaw === 'month'
      ? granularityRaw
      : defaultGranularity(range)

  const dealCategoryRaw = sp.get('dealCategory')
  const customerTypeRaw = sp.get('customerType')
  const filters: AnalyticsFilters = {
    storeId: sp.get('storeId') || null,
    dealCategory: (DEAL_CATEGORIES as readonly string[]).includes(dealCategoryRaw ?? '') ? dealCategoryRaw : null,
    customerType: (CUSTOMER_TYPES as readonly string[]).includes(customerTypeRaw ?? '') ? customerTypeRaw : null,
    leadSource: sp.get('leadSource') || null,
  }

  return { preset, range, compare, granularity, filters }
}

/** Prisma where 用の日付範囲（gte / lt） */
export function dateWhere(range: DateRange) {
  return { gte: range.from, lt: range.to }
}

/** Deal 向けの共通 where（occurredAt 範囲 + 全フィルタ） */
export function dealWhere(range: DateRange, filters: AnalyticsFilters) {
  const where: Record<string, unknown> = { occurredAt: dateWhere(range) }
  if (filters.storeId) where.storeId = filters.storeId
  if (filters.dealCategory) where.category = filters.dealCategory
  const userWhere: Record<string, unknown> = {}
  if (filters.customerType) userWhere.customerType = filters.customerType
  if (filters.leadSource) userWhere.leadSource = filters.leadSource
  if (Object.keys(userWhere).length > 0) where.user = userWhere
  return where
}

/** User（顧客）向けの共通 where（createdAt 範囲 + フィルタ。統合済み顧客は除外） */
export function customerWhere(range: DateRange, filters: AnalyticsFilters) {
  const where: Record<string, unknown> = { createdAt: dateWhere(range), mergedIntoUserId: null }
  if (filters.storeId) where.storeId = filters.storeId
  if (filters.customerType) where.customerType = filters.customerType
  if (filters.leadSource) where.leadSource = filters.leadSource
  return where
}

/** VisitSchedule 向けの共通 where（visitDate 範囲 + フィルタ） */
export function visitWhere(range: DateRange, filters: AnalyticsFilters, status?: string) {
  const where: Record<string, unknown> = { visitDate: dateWhere(range) }
  if (status) where.status = status
  if (filters.storeId) where.storeId = filters.storeId
  const userWhere: Record<string, unknown> = {}
  if (filters.customerType) userWhere.customerType = filters.customerType
  if (filters.leadSource) userWhere.leadSource = filters.leadSource
  if (Object.keys(userWhere).length > 0) where.user = userWhere
  return where
}

/** レスポンスの meta を組み立てる（to は含む最終日に戻して返す） */
export function buildMeta(params: ResolvedParams, notes?: string[]): AnalyticsResponse['meta'] {
  const inclusiveEnd = (r: DateRange) => addDaysStr(jstDateKey(r.to), -1)
  return {
    range: { from: jstDateKey(params.range.from), to: inclusiveEnd(params.range) },
    compareRange: params.compare
      ? { from: jstDateKey(params.compare.from), to: inclusiveEnd(params.compare) }
      : null,
    granularity: params.granularity,
    ...(notes && notes.length > 0 ? { notes } : {}),
  }
}

/** 店舗ID→名前などの解決用に全店舗の軽量リストを取得 */
export async function fetchStoreMap() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, prefecture: true, operatorId: true, storeStatus: true, isActive: true, openingDate: true },
  })
  return new Map(stores.map(s => [s.id, s]))
}
