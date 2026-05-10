import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadFile } from '@/lib/storage'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

/**
 * 研修動画アップロード
 *
 * 動画（大容量）: Vercel Blob クライアントアップロード方式
 *   - ブラウザから直接 Blob ストレージへ送信（サーバーレス関数のボディ制限を回避）
 *   - POST に JSON body（handleUpload プロトコル）を送信
 *
 * サムネイル（小容量）: 従来の FormData 方式
 *   - multipart/form-data で送信
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type') || ''

  // === サムネイル: FormData 方式（従来通り） ===
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const type = formData.get('type') as string | null

      if (!file) {
        return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
      }

      if (type === 'thumbnail') {
        const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024

        if (file.size > MAX_IMAGE_SIZE) {
          return NextResponse.json({ error: 'サムネイル画像は5MB以下にしてください' }, { status: 400 })
        }
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          return NextResponse.json({ error: 'JPEG・PNG・WebP 形式の画像のみ使用できます' }, { status: 400 })
        }

        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
        const buffer = Buffer.from(await file.arrayBuffer())
        const filename = `training-videos/thumbnails/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const url = await uploadFile(buffer, filename, file.type)

        return NextResponse.json({ url, size: file.size })
      }

      // FormData で動画を送った場合のフォールバック（ローカル開発など）
      if (file.size > 500 * 1024 * 1024) {
        return NextResponse.json({ error: '動画ファイルは500MB以下にしてください' }, { status: 400 })
      }
      const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        return NextResponse.json({ error: 'MP4・WebM・MOV 形式の動画のみアップロードできます' }, { status: 400 })
      }
      const ext = file.type === 'video/mp4' ? 'mp4' : file.type === 'video/webm' ? 'webm' : 'mov'
      const buffer = Buffer.from(await file.arrayBuffer())
      const filename = `training-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const url = await uploadFile(buffer, filename, file.type)
      return NextResponse.json({ url, size: file.size })
    } catch (error) {
      console.error('アップロードエラー:', error)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }
  }

  // === 動画: Vercel Blob クライアントアップロード方式 ===
  try {
    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // 認証は上でチェック済み
        return {
          allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          tokenPayload: JSON.stringify({ uploadedBy: (session.user as any).id }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[training-video] Client upload completed:', blob.pathname, blob.url)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('Blob client upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
