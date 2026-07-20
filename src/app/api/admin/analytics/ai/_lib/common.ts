// 分析AI APIの共通ヘルパー: 認証+日次上限、キャッシュ、内部フェッチ、Geminiエラー変換
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, AdminUser } from '@/lib/admin-auth'
import { GeminiError } from '@/lib/gemini'
import { jstDateKey } from '@/lib/datetime'
import type { AnalyticsResponse } from '@/lib/analytics/types'

const MODEL_LABEL = 'gemini-2.5-flash'
/** 全kind合算の1日あたり生成上限（コスト暴走の防波堤） */
const DAILY_GENERATION_LIMIT = 200

export type AiRouteContext = { admin: AdminUser }

/** 認証 + 日次生成上限チェック。NG時は NextResponse を返す */
export async function guardAiRequest(): Promise<AiRouteContext | NextResponse> {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayStartJst = new Date(`${jstDateKey(new Date())}T00:00:00+09:00`)
  const usedToday = await prisma.analyticsAiInsight.count({ where: { createdAt: { gte: todayStartJst } } })
  if (usedToday >= DAILY_GENERATION_LIMIT) {
    return NextResponse.json(
      { error: `本日のAI生成上限（${DAILY_GENERATION_LIMIT}回）に達しました。明日以降に再度お試しください。` },
      { status: 429 },
    )
  }
  return { admin }
}

/** kind + パラメータの正規化ハッシュ */
export function makeCacheKey(kind: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort())
  return createHash('sha256').update(`${kind}:${normalized}`).digest('hex')
}

/** キャッシュ照合（force時はスキップ）。ヒットしたらパース済みcontentを返す */
export async function findCached<T>(kind: string, cacheKey: string, force: boolean): Promise<{ content: T; generatedAt: string } | null> {
  if (force) return null
  const hit = await prisma.analyticsAiInsight.findFirst({
    where: { kind, cacheKey },
    orderBy: { createdAt: 'desc' },
  })
  if (!hit) return null
  try {
    return { content: JSON.parse(hit.content) as T, generatedAt: hit.createdAt.toISOString() }
  } catch {
    return null
  }
}

/** 生成結果を保存 */
export async function saveInsight(args: {
  kind: string
  cacheKey: string
  tab?: string | null
  params: Record<string, unknown>
  content: unknown
  adminId: string
}): Promise<Date> {
  const row = await prisma.analyticsAiInsight.create({
    data: {
      kind: args.kind,
      cacheKey: args.cacheKey,
      tab: args.tab ?? null,
      paramsJson: JSON.stringify(args.params),
      content: JSON.stringify(args.content),
      model: MODEL_LABEL,
      createdById: args.adminId,
    },
  })
  return row.createdAt
}

/** 既存の分析タブAPIを、呼び出し元adminのCookieを転送して内部フェッチする */
export async function fetchTabData(request: NextRequest, tab: string, params: Record<string, string>): Promise<AnalyticsResponse> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v)
  }
  const url = `${request.nextUrl.origin}/api/admin/analytics/${tab}?${qs.toString()}`
  const res = await fetch(url, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`内部データ取得に失敗しました（${tab}: HTTP ${res.status}）`)
  return res.json() as Promise<AnalyticsResponse>
}

/** GeminiError / その他エラーをHTTPレスポンスに変換 */
export function aiErrorResponse(err: unknown): NextResponse {
  if (err instanceof GeminiError) {
    if (err.reason === 'no-key') {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません。環境変数を確認してください。' }, { status: 503 })
    }
    return NextResponse.json({ error: `AI生成に失敗しました: ${err.message}` }, { status: 502 })
  }
  console.error('[analytics-ai] error:', err)
  const message = err instanceof Error ? err.message : 'AI分析でエラーが発生しました'
  return NextResponse.json({ error: message }, { status: 500 })
}
