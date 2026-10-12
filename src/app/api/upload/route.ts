import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveImage } from '@/lib/image-server'
import { v4 as uuidv4 } from 'uuid'
import { ADMIN_ROLES } from '@/lib/admin-auth'

// 画像アップロード（管理者・店舗から利用）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role
  // 管理・店舗・sysadmin の画面だけが使う（お知らせ本文・不具合報告・備品画像）
  if (role !== 'store' && role !== 'sysadmin' && !(ADMIN_ROLES as string[]).includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })

    // 画像のみ許可
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルのみアップロードできます' }, { status: 400 })
    }

    // 10MB制限
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url } = await saveImage(buffer, `announcements/${uuidv4()}`, file.type)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
