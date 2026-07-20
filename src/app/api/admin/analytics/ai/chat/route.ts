import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'
import { resolvePreset, PRESETS, PresetKey } from '@/lib/analytics/period'
import { compactAnalyticsData, planChat, answerChat } from '@/lib/analytics/ai'
import { AI_QUERYABLE_TABS, ANALYTICS_TAB_LABEL, AnalyticsTab, ChatResult, ChatMessageItem } from '@/lib/analytics/types'
import { PRESET_LABEL } from '@/lib/analytics/period'
import { guardAiRequest, makeCacheKey, saveInsight, fetchTabData, aiErrorResponse } from '../_lib/common'
import { collectFreeTexts } from '../_lib/texts'

export const dynamic = 'force-dynamic'

/** クエリ/フィルタ適用で許可するパラメータキー */
const ALLOWED_PARAM_KEYS = ['preset', 'from', 'to', 'compare', 'granularity', 'storeId', 'dealCategory', 'customerType', 'leadSource'] as const
const ALLOWED_FILTER_KEYS = ['tab', ...ALLOWED_PARAM_KEYS] as const

function sanitizeParams(raw: Record<string, string>, allowedTabs: readonly string[], keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const v = raw[key]
    if (!v) continue
    if (key === 'tab' && !allowedTabs.includes(v)) continue
    if (key === 'preset' && !(PRESETS as readonly string[]).includes(v)) continue
    if ((key === 'from' || key === 'to') && !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue
    out[key] = v
  }
  return out
}

// ② AIデータチャット: プラン(必要クエリ設計) → データ取得 → 回答の2段階JSON方式
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json() as {
      question: string
      history: ChatMessageItem[]
      currentParams: Record<string, string>
    }
    const question = String(body.question ?? '').trim().slice(0, 500)
    if (!question) return NextResponse.json({ error: 'invalid request' }, { status: 400 })
    const history = Array.isArray(body.history) ? body.history.slice(-8) : []

    // プランナーに渡すコンテキスト仕様
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } })
    const leadSources = await prisma.leadSource.findMany({ select: { name: true } })
    const contextSpec = `利用できるデータタブ: ${AI_QUERYABLE_TABS.map(t => `${t}(${ANALYTICS_TAB_LABEL[t as AnalyticsTab]})`).join(', ')}
タブの内容ガイド:
- overview: 主要KPI全般（買取/請求金額・案件数・成約率・新規顧客・訪問・問い合わせ）と時系列
- sales: 金額の深掘り（平均単価・品目カテゴリー別金額・高額案件・店舗別売上表）
- deals: 案件ファネル・ステータス内訳・流入経路別案件・失注・問い合わせ/訪問リクエスト
- customers: 顧客属性・リピート・優良顧客・都道府県分布
- stores: **店舗ごとの実績比較はここ**（店舗別の案件数/成約率/買取額の一覧表・スタッフ別実績・運営者別）
- inventory: 買取品目・在庫・売却・粗利
- engagement: 流入経路のCVR表・フォーム・LINE・アクセス・お知らせ既読
- tracking: **外部集客サイトのアクセス解析はここ**（訪問者数/セッション/PV/直帰率/チャネル別/デバイス/地域/ランディングページ/問い合わせCV数・CVR）
期間preset: today(今日) 7d(過去7日) 30d(過去30日) this_month(当月) last_month(前月) this_year(今年) all(全期間) custom(from/to指定)
絞り込み: storeId(店舗) dealCategory(purchase|akikuru|ecotoku) customerType(visit|delivery|regular|akikuru) leadSource(流入経路名)
店舗名→storeId対応表: ${JSON.stringify(stores.map(s => ({ id: s.id, name: s.name })))}
流入経路の選択肢: ${JSON.stringify(leadSources.map(l => l.name))}
今日の日付(JST): ${jstDateKey(new Date())}
ユーザーが今画面で見ている条件: ${JSON.stringify(body.currentParams)}`

    const plan = await planChat(question, history, contextSpec)

    // データ不要の直接回答
    if (plan.directAnswer && plan.queries.length === 0 && !plan.knowledge) {
      const content: ChatResult = { answer: plan.directAnswer, usedData: [], appliedFilters: null }
      await saveInsight({
        kind: 'chat', cacheKey: makeCacheKey('chat', { q: question, t: Date.now() }),
        params: { question }, content, adminId: guard.admin.id,
      })
      return NextResponse.json({ content, cached: false, generatedAt: new Date().toISOString() })
    }

    // クエリ実行（最大3件、パラメータはホワイトリスト検証）
    const gathered: { label: string; data: unknown }[] = []
    for (const q of plan.queries.slice(0, 3)) {
      if (!(AI_QUERYABLE_TABS as readonly string[]).includes(q.tab)) continue
      const params = sanitizeParams(q.params, AI_QUERYABLE_TABS, ALLOWED_PARAM_KEYS)
      try {
        const data = await fetchTabData(request, q.tab, { compare: 'prev', ...params })
        const presetLabel = params.preset ? (PRESET_LABEL[params.preset as PresetKey] ?? params.preset) : '過去30日'
        const storeName = params.storeId ? (stores.find(s => s.id === params.storeId)?.name ?? '') : ''
        gathered.push({
          label: `${ANALYTICS_TAB_LABEL[q.tab as AnalyticsTab]}タブ（${presetLabel}${storeName ? `・${storeName}` : ''}）`,
          data: compactAnalyticsData(data),
        })
      } catch (e) {
        console.error('[analytics-ai chat] query failed:', q.tab, e)
      }
    }

    // ナレッジ（自由記述テキスト）
    if (plan.knowledge) {
      const presetRaw = body.currentParams?.preset
      const preset: PresetKey = (PRESETS as readonly string[]).includes(presetRaw ?? '') ? (presetRaw as PresetKey) : '30d'
      const range = resolvePreset(preset === 'custom' ? 'custom' : preset, {
        from: body.currentParams?.from, to: body.currentParams?.to,
      })
      const texts = await collectFreeTexts(range, body.currentParams?.storeId || null)
      gathered.push({ label: `自由記述テキスト（問い合わせ・案件メモ・買取相談 ${texts.length}件）`, data: texts })
    }

    // フィルタ適用アクション（ホワイトリスト検証）
    const appliedFilters = plan.applyFilters
      ? sanitizeParams(plan.applyFilters, AI_QUERYABLE_TABS, ALLOWED_FILTER_KEYS)
      : null
    const validFilters = appliedFilters && Object.keys(appliedFilters).length > 0 ? appliedFilters : null

    const content = await answerChat(question, history, gathered, validFilters)

    await saveInsight({
      kind: 'chat', cacheKey: makeCacheKey('chat', { q: question, t: Date.now() }),
      params: { question, queries: plan.queries, knowledge: plan.knowledge },
      content, adminId: guard.admin.id,
    })
    return NextResponse.json({ content, cached: false, generatedAt: new Date().toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
