import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireKnowledgeAdmin } from '@/lib/knowledge-api'
import { KNOWLEDGE_QUERY_STATUS_VALUES } from '@/lib/knowledge'

/**
 * GET: AIチャットの質問ログ。
 * 既定では「ナレッジで回答できなかった質問」だけを返す（ナレッジの穴を埋めるため）。
 * ?answered=all で全件、?status=open|resolved|ignored で絞り込み。
 */
export async function GET(req: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const answeredParam = sp.get('answered')
  const statusParam = sp.get('status')

  const where: Record<string, unknown> = {}
  if (answeredParam !== 'all') where.answered = false
  if (statusParam && KNOWLEDGE_QUERY_STATUS_VALUES.includes(statusParam)) where.status = statusParam

  const [queries, openCount] = await Promise.all([
    prisma.knowledgeQuery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, question: true, answered: true, status: true,
        viewerType: true, storeId: true, createdAt: true,
      },
    }),
    // 未対応の未回答件数（タブのバッジ用）
    prisma.knowledgeQuery.count({ where: { answered: false, status: 'open' } }),
  ])

  // 店舗名は件数が少ないのでまとめて解決する（N+1を避ける）
  const storeIds = [...new Set(queries.map(q => q.storeId).filter((v): v is string => !!v))]
  const stores = storeIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const storeNameById = new Map(stores.map(s => [s.id, s.name]))

  return NextResponse.json({
    queries: queries.map(q => ({ ...q, storeName: q.storeId ? storeNameById.get(q.storeId) ?? null : null })),
    openCount,
  })
}
