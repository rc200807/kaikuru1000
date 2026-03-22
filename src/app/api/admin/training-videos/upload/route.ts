import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadFile } from '@/lib/storage'
import { validateVideoFile } from '@/lib/file-validation'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null // 'video' or 'thumbnail'

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    if (type === 'thumbnail') {
      // サムネイル画像: 5MB以下、JPEG/PNG/WebP
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

    // 動画ファイル検証
    const validation = await validateVideoFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `training-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${validation.ext}`
    const url = await uploadFile(buffer, filename, file.type)

    return NextResponse.json({ url, size: file.size })
  } catch (error) {
    console.error('動画アップロードエラー:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
