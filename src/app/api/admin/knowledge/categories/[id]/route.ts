import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { requireKnowledgeAdmin, faqCategoryInputSchema } from '@/lib/knowledge-api'

/** PATCH: カテゴリーの改名・色・有効切替 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.faqCategory.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'カテゴリーが見つかりません' }, { status: 404 })

  const parsed = faqCategoryInputSchema.partial().safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  if (parsed.data.name) {
    const dup = await prisma.faqCategory.findFirst({
      where: { name: parsed.data.name, id: { not: id } },
      select: { id: true },
    })
    if (dup) return NextResponse.json({ error: '同じ名前のカテゴリーが既にあります' }, { status: 400 })
  }

  const updated = await prisma.faqCategory.update({
    where: { id },
    data: parsed.data,
    include: { _count: { select: { faqs: true } } },
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQカテゴリーを編集「${updated.name}」`, req,
  })

  return NextResponse.json(updated)
}

/**
 * DELETE: カテゴリーを削除。
 * FAQが紐づいている場合は 409 を返し、?force=1 が付いていれば削除する
 * （紐づくFAQのカテゴリーは未分類になる。Faq.categoryId は SetNull）。
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.faqCategory.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { faqs: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'カテゴリーが見つかりません' }, { status: 404 })

  const force = req.nextUrl.searchParams.get('force') === '1'
  const referenceCount = existing._count.faqs

  if (referenceCount > 0 && !force) {
    return NextResponse.json({
      requiresConfirm: true,
      referenceCount,
      message: `このカテゴリーには ${referenceCount} 件のFAQが紐づいています。削除すると、それらは未分類になります。`,
    }, { status: 409 })
  }

  await prisma.faqCategory.delete({ where: { id } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQカテゴリーを削除「${existing.name}」（FAQ ${referenceCount}件が未分類に）`, req,
  })

  return NextResponse.json({ deleted: true, unassignedFaqs: referenceCount })
}
