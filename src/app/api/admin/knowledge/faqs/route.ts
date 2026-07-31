import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { sanitizeFaqHtml, isEmptyFaqHtml } from '@/lib/faq-sanitize'
import { requireKnowledgeAdmin, faqInputSchema } from '@/lib/knowledge-api'

const FAQ_SELECT = {
  id: true, question: true, answer: true, visibility: true, isPublished: true,
  sortOrder: true, categoryId: true, createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
} as const

/** GET: FAQ一覧（管理者は公開範囲・下書きを問わず全件見られる） */
export async function GET() {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const faqs = await prisma.faq.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: FAQ_SELECT,
  })
  return NextResponse.json(faqs)
}

/** POST: FAQを登録 */
export async function POST(req: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = faqInputSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const answer = sanitizeFaqHtml(parsed.data.answer)
  if (isEmptyFaqHtml(answer)) {
    return NextResponse.json({ error: '回答は必須です' }, { status: 400 })
  }

  const categoryId = parsed.data.categoryId || null
  if (categoryId) {
    const exists = await prisma.faqCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: '指定されたカテゴリーが見つかりません' }, { status: 400 })
  }

  const maxSort = await prisma.faq.aggregate({ _max: { sortOrder: true } })

  const created = await prisma.faq.create({
    data: {
      question: parsed.data.question,
      answer,
      categoryId,
      visibility: parsed.data.visibility,
      isPublished: parsed.data.isPublished ?? true,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      createdById: user.id,
    },
    select: FAQ_SELECT,
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQを登録「${created.question}」`, req,
  })

  return NextResponse.json(created, { status: 201 })
}
