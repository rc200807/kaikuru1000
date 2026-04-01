import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateIdDocumentFile } from '@/lib/file-validation'
import { uploadFile, deleteFile } from '@/lib/storage'
import { extractIdDocumentInfo } from '@/lib/gemini'
import { isAddressMatch } from '@/lib/address-utils'

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

  const user = await prisma.user.findUnique({ where: { id }, select: { idDocumentPath: true } })
  if (!user?.idDocumentPath) {
    return NextResponse.json({ error: '身分証明書が未提出です' }, { status: 404 })
  }

  // Blob ファイルを削除
  try {
    await deleteFile(user.idDocumentPath)
  } catch {
    // ファイル削除失敗はログのみ（DB側のクリアは続行）
    console.warn('[DELETE id-document] blob delete failed, continuing DB clear')
  }

  // 裏面画像がある場合も削除
  const fullUser = await prisma.user.findUnique({ where: { id }, select: { idDocumentBackPath: true } })
  if (fullUser?.idDocumentBackPath) {
    try { await deleteFile(fullUser.idDocumentBackPath) } catch { /* ignore */ }
  }

  // 身分証関連フィールドをすべてクリア
  await prisma.user.update({
    where: { id },
    data: {
      idDocumentPath:     null,
      idDocumentUploadedAt: null,
      idDocumentType:     null,
      idName:             null,
      idBirthDate:        null,
      idAddress:          null,
      idLicenseNumber:    null,
      idExpiryDate:       null,
      idOcrIssueReport:   null,
      idDocumentBackPath: null,
      idBackAddress:      null,
      idFacePhotoPath:    null,
    },
  })

  return NextResponse.json({ success: true })
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
    const documentType = formData.get('documentType') as string | null

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
      `id-documents/${id}_${Date.now()}.${validation.ext}`,
      file.type, // Magic Number 検証済みの MIME タイプ
    )

    // 古いファイルの削除
    const existingUser = await prisma.user.findUnique({ where: { id } })
    if (existingUser?.idDocumentPath) {
      await deleteFile(existingUser.idDocumentPath)
    }

    // Gemini Vision OCR で身分証情報を抽出（失敗しても upload は成功扱い）
    const ocrResult = await extractIdDocumentInfo(buffer, file.type)

    // 住所一致判定（OCRで住所が取得できた場合）
    const currentUser = await prisma.user.findUnique({ where: { id }, select: { address: true } })
    let addressMismatchFlag = false
    let addressVerifiedFlag = false
    if (ocrResult?.idAddress && currentUser?.address) {
      const matched = isAddressMatch(currentUser.address, ocrResult.idAddress)
      addressMismatchFlag = !matched
      addressVerifiedFlag = matched
    }

    await prisma.user.update({
      where: { id },
      data: {
        idDocumentPath:   fileUrl,
        idDocumentUploadedAt: new Date(), // 4日後の自動削除用タイムスタンプ
        idOcrIssueReport: null, // 再アップロード時は誤り報告をリセット
        // クライアントから documentType が指定された場合はそれを優先
        ...(documentType ? { idDocumentType: documentType } : {}),
        // OCR成功時のみ更新（null なら既存値を上書きしない）
        ...(ocrResult && {
          // documentType が明示指定されていなければ OCR 結果を使用
          ...(!documentType && ocrResult.idDocumentType ? { idDocumentType: ocrResult.idDocumentType } : {}),
          idName:          ocrResult.idName,
          idBirthDate:     ocrResult.idBirthDate,
          idAddress:       ocrResult.idAddress,
          idLicenseNumber: ocrResult.idLicenseNumber,
          idExpiryDate:    ocrResult.idExpiryDate,
        }),
        // 住所一致判定結果
        ...(ocrResult?.idAddress ? {
          addressMismatch: addressMismatchFlag,
          addressVerified: addressVerifiedFlag,
        } : {}),
      },
    })

    return NextResponse.json({
      path: fileUrl,
      ocr: ocrResult ?? null,
      documentType: documentType || ocrResult?.idDocumentType || null,
      addressMismatch: addressMismatchFlag,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
