import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { requireKnowledgeAdmin, faqCategoryInputSchema } from '@/lib/knowledge-api'

/** GET: カテゴリー一覧（並び順・FAQ件数つき） */
export async function GET() {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.faqCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { faqs: true } } },
  })
  return NextResponse.json(categories)
}

/** POST: カテゴリーを追加 */
export async function POST(req: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = faqCategoryInputSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const dup = await prisma.faqCategory.findUnique({ where: { name: parsed.data.name }, select: { id: true } })
  if (dup) return NextResponse.json({ error: '同じ名前のカテゴリーが既にあります' }, { status: 400 })

  const maxSort = await prisma.faqCategory.aggregate({ _max: { sortOrder: true } })

  const created = await prisma.faqCategory.create({
    data: {
      name: parsed.data.name,
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    include: { _count: { select: { faqs: true } } },
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQカテゴリーを追加「${created.name}」`, req,
  })

  return NextResponse.json(created, { status: 201 })
}
