import { NextRequest, NextResponse } from 'next/server'
import { detectAnomalies } from '@/lib/analytics/stats'
import { compactAnalyticsData, explainAnomalies } from '@/lib/analytics/ai'
import type { AnalyticsResponse, AnomaliesResult, AnomalyAnnotation } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

/** 異常検知の対象にする series キー → 表示名（タブ横断の代表指標） */
const SERIES_NAME: Record<string, string> = {
  purchase: '買取金額',
  billing: '請求金額',
  deals: '案件数',
  customers: '新規顧客数',
  count: '件数',
  sold: '売却額',
}

// B2 チャート異常の自動注釈: zスコア検知(JS) + 上位のみAIが要因説明
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { tab: string; params: Record<string, string>; data: AnalyticsResponse; force?: boolean }
    if (!body.data?.series) return NextResponse.json({ error: 'invalid request' }, { status: 400 })

    const cacheParams = { tab: body.tab, ...body.params }
    const cacheKey = makeCacheKey('anomalies', cacheParams)
    const cached = await findCached<AnomaliesResult>('anomalies', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    // 全seriesの数値キーからzスコア異常を検出
    const annotations: AnomalyAnnotation[] = []
    for (const [, points] of Object.entries(body.data.series)) {
      if (!Array.isArray(points) || points.length < 6) continue
      const numericKeys = Object.keys(points[0] ?? {}).filter(k => k !== 'label' && typeof points[0][k] === 'number' && !k.startsWith('prev') && k !== 'cumulative' && !k.includes('low') && !k.includes('high'))
      for (const key of numericKeys) {
        const series = points.map(p => ({ label: String(p.label), value: Number(p[key]) || 0 }))
        for (const a of detectAnomalies(series, 3.5, 3)) {
          annotations.push({
            seriesKey: key,
            seriesName: SERIES_NAME[key] ?? key,
            label: a.label,
            value: a.value,
            expected: a.expected,
            direction: a.direction,
            explanation: null,
          })
        }
      }
    }
    annotations.sort((a, b) => Math.abs(b.value - b.expected) / Math.max(1, b.expected) - Math.abs(a.value - a.expected) / Math.max(1, a.expected))
    const top = annotations.slice(0, 5)

    let summary: string | null = null
    if (top.length > 0) {
      const explainTargets = top.slice(0, 3)
      const { explanations, summary: aiSummary } = await explainAnomalies(
        explainTargets.map(a => ({ series: a.seriesName, period: a.label, value: a.value, average: a.expected, direction: a.direction })),
        compactAnalyticsData(body.data),
      )
      explainTargets.forEach((a, i) => { a.explanation = explanations[i] ?? null })
      summary = aiSummary
    }

    const content: AnomaliesResult = { annotations: top, summary }
    const createdAt = await saveInsight({ kind: 'anomalies', cacheKey, tab: body.tab, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
