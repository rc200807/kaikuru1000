import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { compactAnalyticsData, diagnoseStoreAi } from '@/lib/analytics/ai'
import type { DiagnosisResult } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, fetchTabData, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

// ④ 店舗AI診断: 対象店舗の実績を全店舗ベンチマークと比較してカルテ生成
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { storeId: string; params?: Record<string, string>; force?: boolean }
    const storeId = String(body.storeId ?? '')
    const store = storeId ? await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }) : null
    if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 400 })

    const p = body.params ?? {}
    const periodParams = { preset: p.preset ?? '30d', from: p.from ?? '', to: p.to ?? '', compare: 'prev' }

    const cacheParams = { storeId, ...periodParams }
    const cacheKey = makeCacheKey('store_diagnosis', cacheParams)
    const cached = await findCached<DiagnosisResult>('store_diagnosis', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    // 対象店舗の概要（storeId絞り込み）+ 全店舗ベンチマーク（storesタブ）
    const [storeOverview, benchmark] = await Promise.all([
      fetchTabData(request, 'overview', { ...periodParams, storeId }),
      fetchTabData(request, 'stores', periodParams),
    ])

    const content = await diagnoseStoreAi(store.name, compactAnalyticsData(storeOverview), compactAnalyticsData(benchmark))
    const createdAt = await saveInsight({ kind: 'store_diagnosis', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
