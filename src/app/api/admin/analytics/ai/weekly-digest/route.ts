import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'
import { jstWeekKey, addDaysStr } from '@/lib/analytics/period'
import { compactAnalyticsData, generateReport } from '@/lib/analytics/ai'
import { AI_QUERYABLE_TABS, ANALYTICS_TAB_LABEL, AnalyticsTab, ReportResult } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, fetchTabData, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

/** 先週（月曜〜日曜）の日付範囲 */
function lastWeekRange(): { from: string; to: string } {
  const thisMonday = jstWeekKey(new Date())
  return { from: addDaysStr(thisMonday, -7), to: addDaysStr(thisMonday, -1) }
}

// B1 週次AIダイジェスト（GET=履歴一覧 / POST=先週分をlazy生成）
export async function GET() {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  const rows = await prisma.analyticsAiInsight.findMany({
    where: { kind: 'weekly_digest' },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, paramsJson: true, content: true, createdAt: true },
  })
  // 同じ週の重複は最新のみ
  const seen = new Set<string>()
  const history = rows.flatMap(r => {
    try {
      const params = JSON.parse(r.paramsJson) as { from?: string; to?: string }
      const weekKey = params.from ?? r.id
      if (seen.has(weekKey)) return []
      seen.add(weekKey)
      return [{ id: r.id, from: params.from ?? null, to: params.to ?? null, content: JSON.parse(r.content) as ReportResult, generatedAt: r.createdAt.toISOString() }]
    } catch {
      return []
    }
  })
  return NextResponse.json({ history, currentWeekFrom: lastWeekRange().from })
}

export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json().catch(() => ({})) as { force?: boolean }
    const { from, to } = lastWeekRange()

    const cacheParams = { from, to }
    const cacheKey = makeCacheKey('weekly_digest', cacheParams)
    const cached = await findCached<ReportResult>('weekly_digest', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    const tabs: { label: string; data: unknown }[] = []
    for (const tab of AI_QUERYABLE_TABS) {
      try {
        const data = await fetchTabData(request, tab, { preset: 'custom', from, to, compare: 'prev' })
        tabs.push({ label: ANALYTICS_TAB_LABEL[tab as AnalyticsTab], data: compactAnalyticsData(data) })
      } catch (e) {
        console.error('[analytics-ai weekly-digest] tab fetch failed:', tab, e)
      }
    }
    if (tabs.length === 0) return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })

    const content = await generateReport('週次ダイジェスト', `${from} 〜 ${to}（先週・前週比較つき）`, tabs)
    const createdAt = await saveInsight({ kind: 'weekly_digest', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString(), from, to, day: jstDateKey(new Date()) })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
