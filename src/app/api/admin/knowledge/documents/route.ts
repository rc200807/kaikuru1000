import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { requireKnowledgeAdmin, knowledgeDocumentCreateSchema } from '@/lib/knowledge-api'

const DOCUMENT_SELECT = {
  id: true, title: true, fileName: true, mimeType: true, fileSize: true,
  visibility: true, status: true, errorMessage: true, attempts: true,
  createdAt: true, updatedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const

/** GET: 資料一覧（管理者は公開範囲を問わず全件見られる） */
export async function GET() {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: { createdAt: 'desc' },
    select: DOCUMENT_SELECT,
  })
  return NextResponse.json(documents)
}

/** POST: クライアント直アップロード完了後にメタデータを登録（status=pending でAI抽出待ち） */
export async function POST(req: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = knowledgeDocumentCreateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const created = await prisma.knowledgeDocument.create({
    data: {
      title: parsed.data.title?.trim() || parsed.data.fileName,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      fileSize: parsed.data.fileSize,
      visibility: parsed.data.visibility ?? 'all',
      status: 'pending',
      uploadedById: user.id,
    },
    select: DOCUMENT_SELECT,
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `ナレッジベースに資料を追加「${created.title}」`, req,
  })

  return NextResponse.json(created, { status: 201 })
}
