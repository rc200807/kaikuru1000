import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey, jstMonthKey } from '@/lib/datetime'
import { buildBuckets, fillSeries, dateFromJstStr } from '@/lib/analytics/period'
import { linearForecast, paceProjection } from '@/lib/analytics/stats'
import { commentForecast } from '@/lib/analytics/ai'
import type { ForecastResult } from '@/lib/analytics/types'
import { WON_STATUSES, AnalyticsFilters } from '../../_lib/params'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// A1 売上AI予測: 直近12ヶ月の成約買取金額から3ヶ月予測 + 当月着地予測 + AI講評
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { params?: Record<string, string>; force?: boolean }
    const p = body.params ?? {}
    const filters: AnalyticsFilters = {
      storeId: p.storeId || null,
      dealCategory: p.dealCategory || null,
      customerType: p.customerType || null,
      leadSource: p.leadSource || null,
    }

    const now = new Date()
    const todayStr = jstDateKey(now)
    const cacheParams = { ...filters, day: todayStr }
    const cacheKey = makeCacheKey('forecast', cacheParams)
    const cached = await findCached<ForecastResult>('forecast', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    // 直近12ヶ月（当月含む）の月次成約買取金額
    const currentMonth = jstMonthKey(now)
    const [cy, cm] = currentMonth.split('-').map(Number)
    const windowStart = dateFromJstStr(`${new Date(Date.UTC(cy, cm - 1 - 11, 1)).toISOString().slice(0, 7)}-01`)
    const tomorrow = dateFromJstStr(jstDateKey(new Date(now.getTime() + 86_400_000)))

    const where: Record<string, unknown> = {
      occurredAt: { gte: windowStart, lt: tomorrow },
      status: { in: WON_STATUSES },
    }
    if (filters.storeId) where.storeId = filters.storeId
    if (filters.dealCategory) where.category = filters.dealCategory
    const userWhere: Record<string, unknown> = {}
    if (filters.customerType) userWhere.customerType = filters.customerType
    if (filters.leadSource) userWhere.leadSource = filters.leadSource
    if (Object.keys(userWhere).length > 0) where.user = userWhere

    const deals = await prisma.deal.findMany({ where, select: { occurredAt: true, purchaseAmount: true } })

    const range = { from: windowStart, to: tomorrow }
    const buckets = buildBuckets(range, 'month')
    const values = fillSeries(buckets, deals, 'month', d => d.occurredAt, d => d.purchaseAmount ?? 0)
    const history = buckets.map((b, i) => ({ label: b.label, value: values[i] }))

    // 予測は「完了した月」のみで学習（当月は途中経過なので除外）
    const completedValues = values.slice(0, -1)
    const { points } = linearForecast(completedValues, 3)
    const forecastLabels = Array.from({ length: 3 }, (_, k) => {
      const d = new Date(Date.UTC(cy, cm - 1 + k + 1, 1))
      return `${String(d.getUTCFullYear()).slice(2)}/${d.getUTCMonth() + 1}月`
    })
    const forecast = points.map((pt, i) => ({ label: forecastLabels[i], ...pt }))

    // 当月着地予測（経過日数ベースの線形ペース換算）
    const dayOfMonth = Number(todayStr.split('-')[2])
    const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate()
    const currentValue = values[values.length - 1] ?? 0
    const projected = paceProjection(currentValue, dayOfMonth / daysInMonth)

    const commentary = await commentForecast({
      metric: '月次買取金額（成約案件）',
      history,
      forecastNext3Months: forecast,
      currentMonth: { label: `${cm}月`, elapsedDays: dayOfMonth, daysInMonth, currentValue, projectedLanding: projected },
      filters,
    })

    const content: ForecastResult = {
      history,
      forecast,
      landing: { periodLabel: `${cy}年${cm}月`, current: currentValue, projected },
      commentary,
    }
    const createdAt = await saveInsight({ kind: 'forecast', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
