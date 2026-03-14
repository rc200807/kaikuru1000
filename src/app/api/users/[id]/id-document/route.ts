import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateIdDocumentFile } from '@/lib/file-validation'
import { uploadFile, deleteFile } from '@/lib/storage'

/**
 * 身分証明書を認証プロキシ経由で配信
 * Blob URL をクライアントに露出させず、認証・認可チェック後にコンテンツを返す
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 顧客は自分の身分証のみ
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // 店舗は担当顧客の身分証のみ
  if (sessionUser.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて閲覧可

  const user = await prisma.user.findUnique({ where: { id }, select: { idDocumentPath: true } })
  if (!user?.idDocumentPath) {
    return NextResponse.json({ error: '身分証明書が未提出です' }, { status: 404 })
  }

  const blobUrl = user.idDocumentPath

  // ローカル開発（/uploads/...）: 静的ファイルにリダイレクト
  if (!blobUrl.startsWith('https://')) {
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

  // 本番: プロキシ配信（Blob URL をクライアントに露出しない）
  try {
    const res = await fetch(blobUrl)
    if (!res.ok) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 })
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'ファイルの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    // Magic Number を含む総合ファイル検証（サイズ・形式・ヘッダー）
    const validation = await validateIdDocumentFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileUrl = await uploadFile(
      Buffer.from(arrayBuffer),
      `id-documents/${id}_${Date.now()}.${validation.ext}`,
      file.type, // Magic Number 検証済みの MIME タイプ
    )

    // 古いファイルの削除
    const user = await prisma.user.findUnique({ where: { id } })
    if (user?.idDocumentPath) {
      await deleteFile(user.idDocumentPath)
    }

    await prisma.user.update({
      where: { id },
      data: { idDocumentPath: fileUrl },
    })

    return NextResponse.json({ path: fileUrl })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
