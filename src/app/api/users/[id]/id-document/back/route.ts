import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateIdDocumentFile } from '@/lib/file-validation'
import { uploadFile, deleteFile } from '@/lib/storage'
import { extractBackAddress, GeminiError } from '@/lib/gemini'

/**
 * 身分証明書の裏面画像を認証プロキシ経由で配信
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

  const user = await prisma.user.findUnique({ where: { id }, select: { idDocumentBackPath: true } })
  if (!user?.idDocumentBackPath) {
    return NextResponse.json({ error: '身分証明書の裏面が未提出です' }, { status: 404 })
  }

  const blobUrl = user.idDocumentBackPath

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

/**
 * 身分証明書の裏面画像を削除
 */
export async function DELETE(
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
  // admin はすべて操作可

  const user = await prisma.user.findUnique({ where: { id }, select: { idDocumentBackPath: true } })
  if (!user?.idDocumentBackPath) {
    return NextResponse.json({ error: '身分証明書の裏面が未提出です' }, { status: 404 })
  }

  // Blob ファイルを削除
  try {
    await deleteFile(user.idDocumentBackPath)
  } catch {
    console.warn('[DELETE id-document/back] blob delete failed, continuing DB clear')
  }

  await prisma.user.update({
    where: { id },
    data: {
      idDocumentBackPath: null,
      idBackAddress:      null,
    },
  })

  return NextResponse.json({ success: true })
}

/**
 * 身分証明書の裏面画像をアップロード
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

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    // Magic Number を含む総合ファイル検証（サイズ・形式・ヘッダー）
    const validation = await validateIdDocumentFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ファイルアップロード
    const fileUrl = await uploadFile(
      buffer,
      `id-documents/${id}_back_${Date.now()}.${validation.ext}`,
      file.type,
    )

    // 古い裏面ファイルの削除
    const existingUser = await prisma.user.findUnique({ where: { id } })
    if (existingUser?.idDocumentBackPath) {
      await deleteFile(existingUser.idDocumentBackPath)
    }

    // Gemini Vision OCR で裏面新住所を抽出（失敗しても upload は成功扱い）
    let newAddress: string | null = null
    try {
      newAddress = await extractBackAddress(buffer, file.type)
    } catch (err) {
      if (err instanceof GeminiError) {
        console.warn('[id-document/back] OCR失敗:', err.reason, err.message)
      } else {
        console.error('[id-document/back] OCR想定外エラー:', err)
      }
    }

    await prisma.user.update({
      where: { id },
      data: {
        idDocumentBackPath: fileUrl,
        ...(newAddress !== null ? { idBackAddress: newAddress } : {}),
      },
    })

    return NextResponse.json({
      path: fileUrl,
      backAddress: newAddress,
    })
  } catch (error) {
    console.error('Back image upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
