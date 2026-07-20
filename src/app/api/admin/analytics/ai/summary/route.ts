import { NextRequest, NextResponse } from 'next/server'
import { compactAnalyticsData, generateTabInsight } from '@/lib/analytics/ai'
import { ANALYTICS_TAB_LABEL, AnalyticsTab, AnalyticsResponse, TabInsight } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// ① タブAIインサイト要約: クライアントが表示中の集計データをPOST → AIが要約
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { tab: string; params: Record<string, string>; data: AnalyticsResponse; force?: boolean }
    const tabLabel = ANALYTICS_TAB_LABEL[body.tab as AnalyticsTab]
    if (!tabLabel || !body.data) {
      return NextResponse.json({ error: 'invalid request' }, { status: 400 })
    }

    const cacheParams = { tab: body.tab, ...body.params }
    const cacheKey = makeCacheKey('tab_summary', cacheParams)
    const cached = await findCached<TabInsight>('tab_summary', cacheKey, body.force === true)
    if (cached) {
      return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })
    }

    const compact = compactAnalyticsData(body.data)
    const periodDesc = `${body.data.meta.range.from} 〜 ${body.data.meta.range.to}${body.data.meta.compareRange ? `（比較: ${body.data.meta.compareRange.from} 〜 ${body.data.meta.compareRange.to}）` : ''}`
    const insight = await generateTabInsight(tabLabel, periodDesc, compact)

    const createdAt = await saveInsight({
      kind: 'tab_summary', cacheKey, tab: body.tab, params: cacheParams, content: insight, adminId: guard.admin.id,
    })
    return NextResponse.json({ content: insight, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
