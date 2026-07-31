import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveKnowledgeViewer } from '@/lib/knowledge-api'

/**
 * GET: 店舗が閲覧できるFAQ一覧。
 * 公開済み（isPublished）かつ公開範囲が 'all' のものだけを返す。
 * 「管理者のみ」のFAQは店舗には一切出さないため、ここで必ず絞る。
 */
export async function GET() {
  const viewer = await resolveKnowledgeViewer('store')
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const faqs = await prisma.faq.findMany({
    where: { isPublished: true, visibility: 'all' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, question: true, answer: true, updatedAt: true,
      category: { select: { id: true, name: true, color: true } },
    },
  })
  return NextResponse.json(faqs)
}
