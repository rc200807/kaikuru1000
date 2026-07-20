import { NextRequest, NextResponse } from 'next/server'
import { jstDateKey } from '@/lib/datetime'
import { resolvePreset, PRESETS, PresetKey } from '@/lib/analytics/period'
import { mineTexts } from '@/lib/analytics/ai'
import type { TextMiningResult } from '@/lib/analytics/types'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'
import { collectFreeTexts } from '../_lib/texts'

export const dynamic = 'force-dynamic'

// C1 テキストマイニング: 問い合わせ・案件メモ・買取相談の自由記述をAIがテーマ分類
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as { params?: Record<string, string>; force?: boolean }
    const p = body.params ?? {}
    const presetRaw = p.preset
    const preset: PresetKey = (PRESETS as readonly string[]).includes(presetRaw ?? '') ? (presetRaw as PresetKey) : '30d'
    const storeId = p.storeId || null

    const cacheParams = { preset, from: p.from ?? null, to: p.to ?? null, storeId, day: jstDateKey(new Date()) }
    const cacheKey = makeCacheKey('text_mining', cacheParams)
    const cached = await findCached<TextMiningResult>('text_mining', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    const range = resolvePreset(preset, { from: p.from, to: p.to })
    const texts = await collectFreeTexts(range, storeId)
    if (texts.length === 0) {
      const empty: TextMiningResult = { themes: [], lostReasons: [], insights: ['この期間に分析対象のテキストがありません'], analyzedCount: 0 }
      return NextResponse.json({ content: empty, cached: false, generatedAt: new Date().toISOString() })
    }

    const periodLabel = `${jstDateKey(range.from)} 〜 ${jstDateKey(new Date(range.to.getTime() - 1))}`
    const content = await mineTexts(texts, periodLabel)
    const createdAt = await saveInsight({ kind: 'text_mining', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
