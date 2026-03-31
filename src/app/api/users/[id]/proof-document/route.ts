import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateIdDocumentFile } from '@/lib/file-validation'
import { uploadFile, deleteFile } from '@/lib/storage'

/**
 * 住所証明書類を認証プロキシ経由で配信
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 顧客は自分の書類のみ
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // 店舗は担当顧客の書類のみ
  if (sessionUser.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { proofDocumentPath: true } })
  if (!user?.proofDocumentPath) {
    return NextResponse.json({ error: '住所証明書類が未提出です' }, { status: 404 })
  }

  const blobUrl = user.proofDocumentPath

  if (!blobUrl.startsWith('https://')) {
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

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

/**
 * 住所証明書類のアップロード
 */
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
    const documentType = formData.get('documentType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    if (!documentType) {
      return NextResponse.json({ error: '書類種別を選択してください' }, { status: 400 })
    }

    // ファイル検証
    const validation = await validateIdDocumentFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ファイルアップロード
    const fileUrl = await uploadFile(
      buffer,
      `proof-documents/${id}_${Date.now()}.${validation.ext}`,
      file.type,
    )

    // 古いファイルの削除
    const existingUser = await prisma.user.findUnique({ where: { id }, select: { proofDocumentPath: true } })
    if (existingUser?.proofDocumentPath) {
      try { await deleteFile(existingUser.proofDocumentPath) } catch { /* ignore */ }
    }

    await prisma.user.update({
      where: { id },
      data: {
        proofDocumentPath: fileUrl,
        proofDocumentType: documentType,
        proofDocumentStatus: 'pending',
      },
    })

    return NextResponse.json({
      success: true,
      proofDocumentType: documentType,
      proofDocumentStatus: 'pending',
    })
  } catch (error) {
    console.error('Proof document upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}

/**
 * 住所証明書類の削除
 */
export async function DELETE(
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

  const user = await prisma.user.findUnique({ where: { id }, select: { proofDocumentPath: true } })
  if (!user?.proofDocumentPath) {
    return NextResponse.json({ error: '住所証明書類が未提出です' }, { status: 404 })
  }

  try {
    await deleteFile(user.proofDocumentPath)
  } catch {
    console.warn('[DELETE proof-document] blob delete failed, continuing DB clear')
  }

  await prisma.user.update({
    where: { id },
    data: {
      proofDocumentPath: null,
      proofDocumentType: null,
      proofDocumentStatus: null,
    },
  })

  return NextResponse.json({ success: true })
}
