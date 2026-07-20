import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { whatIfProjection, WhatIfChange, WhatIfBase } from '@/lib/analytics/stats'
import { adviseWhatIf } from '@/lib/analytics/ai'
import { resolveAnalyticsParams, dealWhere, customerWhere, WON_STATUSES } from '../../_lib/params'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

const VALID_METRICS = ['contractRate', 'avgDealAmount', 'dealCount', 'newCustomers']

// D3 What-ifシミュレータ: 試算はJS（即時・正確）、施策提案のみAI
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { changes: WhatIfChange[]; force?: boolean }
    const changes = (Array.isArray(body.changes) ? body.changes : [])
      .filter(c => VALID_METRICS.includes(c?.metric) && Number.isFinite(Number(c?.changePercent)))
      .map(c => ({ metric: c.metric, changePercent: Math.max(-90, Math.min(300, Number(c.changePercent))) }))
      .slice(0, 4)
    if (changes.length === 0) return NextResponse.json({ error: '変化させる指標を指定してください' }, { status: 400 })

    // ベースは request のクエリパラメータ（既存の期間・フィルタ解決を流用）
    const params = await resolveAnalyticsParams(request)
    const [deals, newCustomers] = await Promise.all([
      prisma.deal.findMany({
        where: dealWhere(params.range, params.filters),
        select: { status: true, purchaseAmount: true },
      }),
      prisma.user.count({ where: customerWhere(params.range, params.filters) }),
    ])
    const won = deals.filter(d => WON_STATUSES.includes(d.status))
    const sumPurchase = won.reduce((s, d) => s + (d.purchaseAmount ?? 0), 0)
    const base: WhatIfBase = {
      dealCount: deals.length,
      contractRate: deals.length > 0 ? won.length / deals.length : 0,
      avgDealAmount: won.length > 0 ? sumPurchase / won.length : 0,
      newCustomers,
    }

    const simulation = whatIfProjection(base, changes)

    const qp = Object.fromEntries(request.nextUrl.searchParams)
    const cacheParams = { ...qp, changes }
    const cacheKey = makeCacheKey('whatif', cacheParams)
    const cached = await findCached<{ summary: string; suggestions: { title: string; detail: string }[] }>('whatif', cacheKey, body.force === true)

    let advice = cached?.content ?? null
    let generatedAt = cached?.generatedAt ?? new Date().toISOString()
    if (!advice) {
      advice = await adviseWhatIf({
        period: `${params.range.from.toISOString().slice(0, 10)}〜`,
        base, changes, simulation,
      })
      const createdAt = await saveInsight({ kind: 'whatif', cacheKey, params: cacheParams, content: advice, adminId: guard.admin.id })
      generatedAt = createdAt.toISOString()
    }

    return NextResponse.json({
      content: { base, simulation, advice },
      cached: cached !== null,
      generatedAt,
    })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
