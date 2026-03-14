/**
 * 身分証明書の再OCR（既存画像から再読み取り）
 * POST /api/users/[id]/id-document/reocr
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractIdDocumentInfo } from '@/lib/gemini'
import path from 'path'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  // 顧客は自分のみ、店舗・管理者は担当/全顧客
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (sessionUser.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { idDocumentPath: true },
  })

  if (!user?.idDocumentPath) {
    return NextResponse.json({ error: '身分証明書が未提出です' }, { status: 404 })
  }

  const blobUrl = user.idDocumentPath

  try {
    let buffer: Buffer
    let mimeType: string

    if (blobUrl.startsWith('https://')) {
      // Vercel Blob から取得
      const res = await fetch(blobUrl)
      if (!res.ok) return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 500 })
      mimeType = res.headers.get('content-type') || 'image/jpeg'
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      // ローカル開発: /uploads/... → ファイルシステムから読み込み
      const { readFile } = await import('fs/promises')
      const localPath = path.join(process.cwd(), 'public', blobUrl)
      buffer = await readFile(localPath)
      // 拡張子から MIME タイプを推定
      const ext = path.extname(blobUrl).toLowerCase()
      mimeType = ext === '.pdf' ? 'application/pdf'
        : ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg'
    }

    const ocrResult = await extractIdDocumentInfo(buffer, mimeType)

    if (!ocrResult) {
      return NextResponse.json({ error: 'OCRに失敗しました。画像を再アップロードしてください。', ocr: null })
    }

    // DBに更新
    await prisma.user.update({
      where: { id },
      data: {
        idDocumentType:  ocrResult.idDocumentType,
        idName:          ocrResult.idName,
        idBirthDate:     ocrResult.idBirthDate,
        idAddress:       ocrResult.idAddress,
        idLicenseNumber: ocrResult.idLicenseNumber,
        idExpiryDate:    ocrResult.idExpiryDate,
        // 再読み取り成功時は誤り報告をリセット
        idOcrIssueReport: null,
      },
    })

    return NextResponse.json({ ocr: ocrResult })
  } catch (err) {
    console.error('[reocr] error:', err)
    return NextResponse.json({ error: 'OCRに失敗しました', ocr: null }, { status: 500 })
  }
}
