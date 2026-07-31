import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireKnowledgeAdmin, queryStatusSchema } from '@/lib/knowledge-api'

/** PATCH: 未回答の質問の対応状況を変更する */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.knowledgeQuery.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: '質問ログが見つかりません' }, { status: 404 })

  const parsed = queryStatusSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const updated = await prisma.knowledgeQuery.update({
    where: { id },
    data: { status: parsed.data.status },
    select: { id: true, status: true },
  })
  return NextResponse.json(updated)
}
