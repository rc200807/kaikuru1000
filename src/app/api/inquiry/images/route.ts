import { NextRequest, NextResponse } from 'next/server'
import { saveImage } from '@/lib/image-server'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

/** お問い合わせフォーム用の画像アップロード（認証不要） */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG・PNG・WebP・HEICのみ対応しています' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url } = await saveImage(buffer, `inquiry-items/inquiry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, file.type)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Inquiry image upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
