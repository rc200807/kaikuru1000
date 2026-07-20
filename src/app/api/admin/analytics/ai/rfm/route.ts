import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'
import { computeRfm, RfmInput } from '@/lib/analytics/stats'
import { adviseRfm } from '@/lib/analytics/ai'
import type { RfmResult } from '@/lib/analytics/types'
import { WON_STATUSES } from '../../_lib/params'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// C2 顧客セグメントAI(RFM): 訪問サイクル基準でJS分類 + AIが打ち手提案
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json().catch(() => ({})) as { params?: Record<string, string>; force?: boolean }
    const storeId = body.params?.storeId || null

    const cacheParams = { storeId, day: jstDateKey(new Date()) }
    const cacheKey = makeCacheKey('rfm', cacheParams)
    const cached = await findCached<RfmResult>('rfm', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    const [users, visitAgg, dealAgg] = await Promise.all([
      prisma.user.findMany({
        where: { mergedIntoUserId: null, isActive: true, ...(storeId ? { storeId } : {}) },
        select: { id: true, name: true, visitFrequencyMonths: true },
      }),
      prisma.visitSchedule.groupBy({
        by: ['userId'],
        where: { status: 'completed', ...(storeId ? { storeId } : {}) },
        _count: { _all: true },
        _max: { visitDate: true },
      }),
      prisma.deal.groupBy({
        by: ['userId'],
        where: { status: { in: WON_STATUSES }, ...(storeId ? { storeId } : {}) },
        _sum: { purchaseAmount: true },
      }),
    ])

    const visitMap = new Map(visitAgg.map(g => [g.userId, g]))
    const amountMap = new Map(dealAgg.map(g => [g.userId, g._sum.purchaseAmount ?? 0]))
    const rows: RfmInput[] = users.map(u => ({
      userId: u.id,
      name: u.name,
      lastVisitAt: visitMap.get(u.id)?._max.visitDate ?? null,
      frequency: visitMap.get(u.id)?._count._all ?? 0,
      monetary: amountMap.get(u.id) ?? 0,
      cycleMonths: u.visitFrequencyMonths,
    }))

    const segments = computeRfm(rows, new Date())
    const ai = await adviseRfm(segments.map(s => ({
      key: s.key, label: s.label, count: s.count, totalAmount: s.totalAmount,
      avgFrequency: Math.round(s.avgFrequency * 10) / 10,
    })))

    const content: RfmResult = {
      segments: segments.map((s, i) => ({
        key: s.key,
        label: s.label,
        count: s.count,
        totalAmount: s.totalAmount,
        avgFrequency: Math.round(s.avgFrequency * 10) / 10,
        advice: ai.advices[i] ?? '',
      })),
      summary: ai.summary,
    }
    const createdAt = await saveInsight({ kind: 'rfm', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
