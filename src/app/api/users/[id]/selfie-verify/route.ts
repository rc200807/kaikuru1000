import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compareFaces } from '@/lib/gemini'
import { uploadFile, deleteFile } from '@/lib/storage'

/**
 * セルフィー画像を認証プロキシ経由で配信
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 顧客は自分のセルフィーのみ
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // 店舗は担当顧客のセルフィーのみ
  if (sessionUser.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて閲覧可

  const user = await prisma.user.findUnique({ where: { id }, select: { selfieImagePath: true } })
  if (!user?.selfieImagePath) {
    return NextResponse.json({ error: 'セルフィー画像が未提出です' }, { status: 404 })
  }

  const blobUrl = user.selfieImagePath

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
 * セルフィー画像をアップロードし、身分証の顔写真と照合する
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
    const selfie = formData.get('selfie') as File

    if (!selfie) {
      return NextResponse.json({ error: 'セルフィー画像が選択されていません' }, { status: 400 })
    }

    // 画像ファイルのみ許可
    if (!selfie.type.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルのみアップロード可能です' }, { status: 400 })
    }

    const arrayBuffer = await selfie.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // セルフィー画像をアップロード
    const selfieUrl = await uploadFile(
      buffer,
      `selfies/${id}_${Date.now()}.jpg`,
      selfie.type,
    )

    // 古いセルフィーがあれば削除
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { selfieImagePath: true },
    })
    if (existingUser?.selfieImagePath) {
      try { await deleteFile(existingUser.selfieImagePath) } catch { /* ignore */ }
    }

    // セルフィーURLを保存
    await prisma.user.update({
      where: { id },
      data: { selfieImagePath: selfieUrl },
    })

    // 身分証の顔写真パスを取得（表面）
    const user = await prisma.user.findUnique({
      where: { id },
      select: { idDocumentPath: true },
    })

    if (!user?.idDocumentPath) {
      return NextResponse.json({
        selfieUrl,
        verification: null,
        message: '身分証明書が未提出のため顔照合をスキップしました',
      })
    }

    // Gemini で顔照合
    const verificationResult = await compareFaces(user.idDocumentPath, selfieUrl)

    // 結果を保存
    await prisma.user.update({
      where: { id },
      data: {
        faceVerificationResult: verificationResult ? JSON.stringify(verificationResult) : null,
        faceVerificationAt: new Date(),
      },
    })

    return NextResponse.json({
      selfieUrl,
      verification: verificationResult,
    })
  } catch (error) {
    console.error('[selfie-verify] Upload error:', error)
    return NextResponse.json({ error: 'セルフィーのアップロードに失敗しました' }, { status: 500 })
  }
}

/**
 * セルフィー画像と顔照合結果を削除する
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  // 顧客は自分のセルフィーのみ
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // 店舗は担当顧客のセルフィーのみ
  if (sessionUser.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて操作可

  const user = await prisma.user.findUnique({
    where: { id },
    select: { selfieImagePath: true },
  })
  if (!user?.selfieImagePath) {
    return NextResponse.json({ error: 'セルフィー画像が未提出です' }, { status: 404 })
  }

  // Blob ファイルを削除
  try {
    await deleteFile(user.selfieImagePath)
  } catch {
    console.warn('[DELETE selfie-verify] blob delete failed, continuing DB clear')
  }

  // セルフィー関連フィールドをすべてクリア
  await prisma.user.update({
    where: { id },
    data: {
      selfieImagePath:      null,
      faceVerificationResult: null,
      faceVerificationAt:   null,
    },
  })

  return NextResponse.json({ success: true })
}
