import { NextRequest, NextResponse } from 'next/server'
import { compactAnalyticsData, explainPoint } from '@/lib/analytics/ai'
import { ANALYTICS_TAB_LABEL, AnalyticsTab, ExplainPointResult } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, fetchTabData, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// D1 チャートクリック→AI解説: クリックされたバケット期間に絞った内訳を取得してAIが説明
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as {
      tab: string
      metric: string        // クリックしたチャートの指標名（表示用）
      bucketLabel: string   // クリックしたバケットの表示ラベル
      from: string          // バケットの開始日 yyyy-MM-dd
      to: string            // バケットの最終日 yyyy-MM-dd（含む）
      params: Record<string, string>
      force?: boolean
    }
    const tabLabel = ANALYTICS_TAB_LABEL[body.tab as AnalyticsTab]
    if (!tabLabel || !/^\d{4}-\d{2}-\d{2}$/.test(body.from) || !/^\d{4}-\d{2}-\d{2}$/.test(body.to)) {
      return NextResponse.json({ error: 'invalid request' }, { status: 400 })
    }

    const cacheParams = { tab: body.tab, metric: body.metric, from: body.from, to: body.to, ...body.params }
    const cacheKey = makeCacheKey('explain_point', cacheParams)
    const cached = await findCached<ExplainPointResult>('explain_point', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    // クリックされたバケット期間に絞って同タブの内訳を内部取得
    const narrowData = await fetchTabData(request, body.tab, {
      preset: 'custom',
      from: body.from,
      to: body.to,
      compare: 'prev',
      storeId: body.params.storeId ?? '',
      dealCategory: body.params.dealCategory ?? '',
      customerType: body.params.customerType ?? '',
      leadSource: body.params.leadSource ?? '',
    })

    const content = await explainPoint({
      tab: tabLabel,
      metric: body.metric,
      clickedPeriod: { label: body.bucketLabel, from: body.from, to: body.to },
      breakdownOfClickedPeriod: compactAnalyticsData(narrowData),
    })

    const createdAt = await saveInsight({ kind: 'explain_point', cacheKey, tab: body.tab, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
