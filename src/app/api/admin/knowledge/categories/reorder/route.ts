import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireKnowledgeAdmin, reorderSchema } from '@/lib/knowledge-api'

/** PATCH: カテゴリーの並び順を一括更新（配列の順番がそのまま sortOrder になる） */
export async function PATCH(req: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = reorderSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { ids } = parsed.data

  // 実在しないIDが混ざっていたら何も更新しない
  const found = await prisma.faqCategory.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (found.length !== ids.length) {
    return NextResponse.json({ error: '存在しないカテゴリーが含まれています' }, { status: 400 })
  }

  await prisma.$transaction(
    ids.map((id, i) => prisma.faqCategory.update({ where: { id }, data: { sortOrder: i } })),
  )

  return NextResponse.json({ ok: true })
}
