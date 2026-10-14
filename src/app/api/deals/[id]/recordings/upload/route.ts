import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { ALLOWED_AUDIO_TYPES } from '@/lib/audio-content-type'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']
const MAX_AUDIO_BYTES = 200 * 1024 * 1024 // 200MB

// 会話録音（音声）のクライアント直アップロード用トークン発行。
// ブラウザ → Vercel Blob へ直接送信（サーバーレスのボディ制限を回避）。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (isStore && deal.storeId !== sessionUser.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = (await request.json()) as HandleUploadBody
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_AUDIO_TYPES,
        maximumSizeInBytes: MAX_AUDIO_BYTES,
        tokenPayload: JSON.stringify({ dealId: id, uploadedBy: sessionUser.id }),
      }),
      // 完了通知（onUploadCompleted）は使わない。Vercel からの通知はログインなしで届き、
      // 上のセッション確認で必ず弾かれるため。登録はクライアントが完了後に POST する。
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[deal-recording] blob upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
