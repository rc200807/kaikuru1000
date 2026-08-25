import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { requireKnowledgeAdmin, knowledgeDocumentUpdateSchema } from '@/lib/knowledge-api'

const DOCUMENT_SELECT = {
  id: true, title: true, fileName: true, mimeType: true, fileSize: true,
  visibility: true, status: true, errorMessage: true, attempts: true,
  createdAt: true, updatedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const

/** PATCH: 資料のタイトル・公開範囲を更新 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: '資料が見つかりません' }, { status: 404 })

  const parsed = knowledgeDocumentUpdateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.visibility !== undefined) data.visibility = parsed.data.visibility

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  const updated = await prisma.knowledgeDocument.update({ where: { id }, data, select: DOCUMENT_SELECT })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `ナレッジベースの資料を編集「${updated.title}」`, req,
  })

  return NextResponse.json(updated)
}

/** DELETE: 資料を削除 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!existing) return NextResponse.json({ error: '資料が見つかりません' }, { status: 404 })

  await prisma.knowledgeDocument.delete({ where: { id } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `ナレッジベースの資料を削除「${existing.title}」`, req,
  })

  return NextResponse.json({ deleted: true })
}
