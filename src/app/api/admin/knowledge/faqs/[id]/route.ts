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

/** PATCH: FAQを更新（送られた項目のみ変更） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.faq.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'FAQが見つかりません' }, { status: 404 })

  const parsed = faqInputSchema.partial().safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.question !== undefined) data.question = parsed.data.question
  if (parsed.data.visibility !== undefined) data.visibility = parsed.data.visibility
  if (parsed.data.isPublished !== undefined) data.isPublished = parsed.data.isPublished

  if (parsed.data.answer !== undefined) {
    const answer = sanitizeFaqHtml(parsed.data.answer)
    if (isEmptyFaqHtml(answer)) return NextResponse.json({ error: '回答は必須です' }, { status: 400 })
    data.answer = answer
  }

  if ('categoryId' in parsed.data) {
    const categoryId = parsed.data.categoryId || null
    if (categoryId) {
      const exists = await prisma.faqCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: '指定されたカテゴリーが見つかりません' }, { status: 400 })
    }
    data.categoryId = categoryId
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  const updated = await prisma.faq.update({ where: { id }, data, select: FAQ_SELECT })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQを編集「${updated.question}」`, req,
  })

  return NextResponse.json(updated)
}

/** DELETE: FAQを削除 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.faq.findUnique({ where: { id }, select: { id: true, question: true } })
  if (!existing) return NextResponse.json({ error: 'FAQが見つかりません' }, { status: 404 })

  await prisma.faq.delete({ where: { id } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `FAQを削除「${existing.question}」`, req,
  })

  return NextResponse.json({ deleted: true })
}
