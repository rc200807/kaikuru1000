import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveKnowledgeViewer } from '@/lib/knowledge-api'

/**
 * GET: 店舗向けカテゴリー一覧。
 * 有効なカテゴリーのうち、店舗が見られるFAQ（公開済み・公開範囲all）を
 * 1件以上持つものだけを返す（中身が無いカテゴリーを見せない）。
 */
export async function GET() {
  const viewer = await resolveKnowledgeViewer('store')
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.faqCategory.findMany({
    where: {
      isActive: true,
      faqs: { some: { isPublished: true, visibility: 'all' } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, color: true,
      _count: { select: { faqs: { where: { isPublished: true, visibility: 'all' } } } },
    },
  })
  return NextResponse.json(categories)
}
