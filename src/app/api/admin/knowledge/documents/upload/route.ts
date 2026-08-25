import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireKnowledgeAdmin } from '@/lib/knowledge-api'

const ALLOWED_DOCUMENT_TYPES = ['application/pdf']
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024 // 50MB

// ナレッジベースの資料（PDF）のクライアント直アップロード用トークン発行。
// ブラウザ → Vercel Blob へ直接送信（サーバーレスのボディ制限を回避）。
export async function POST(request: NextRequest) {
  const user = await requireKnowledgeAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await request.json()) as HandleUploadBody
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_DOCUMENT_TYPES,
        maximumSizeInBytes: MAX_DOCUMENT_BYTES,
        tokenPayload: JSON.stringify({ uploadedBy: user.id }),
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('[knowledge-document] client upload completed:', blob.pathname)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[knowledge-document] blob upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
