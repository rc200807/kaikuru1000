import { NextRequest, NextResponse } from 'next/server'
import { compactAnalyticsData, generateReport } from '@/lib/analytics/ai'
import { AI_QUERYABLE_TABS, ANALYTICS_TAB_LABEL, AnalyticsTab, ReportResult } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, fetchTabData, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// ③ AI月次レポート: 全タブ横断データから経営レポートを生成
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { params?: Record<string, string>; force?: boolean }
    const params = body.params ?? {}

    const cacheKey = makeCacheKey('report', params)
    const cached = await findCached<ReportResult>('report', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    // 全タブのデータを内部取得（1本失敗しても続行）
    const tabs: { label: string; data: unknown }[] = []
    let periodLabel = ''
    for (const tab of AI_QUERYABLE_TABS) {
      try {
        const data = await fetchTabData(request, tab, { compare: 'prev', ...params })
        if (!periodLabel) periodLabel = `${data.meta.range.from} 〜 ${data.meta.range.to}`
        tabs.push({ label: ANALYTICS_TAB_LABEL[tab as AnalyticsTab], data: compactAnalyticsData(data) })
      } catch (e) {
        console.error('[analytics-ai report] tab fetch failed:', tab, e)
      }
    }
    if (tabs.length === 0) return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })

    const content = await generateReport('経営レポート', periodLabel, tabs)
    const createdAt = await saveInsight({ kind: 'report', cacheKey, params, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
