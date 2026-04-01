import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/storage'

/**
 * POST /api/cron/cleanup-id-documents
 *
 * 身分証画像の自動削除（登録から4日経過後）
 * 条件:
 *   - idDocumentPath が存在する
 *   - idDocumentUploadedAt から4日以上経過
 *   - addressMismatch が false（住所不一致なし）
 *   - addressVerified が true または addressMismatch が false
 *   - idOcrIssueReport が null（誤り報告なし）
 *
 * 削除対象: 画像ファイルのみ（idDocumentPath, idDocumentBackPath, idFacePhotoPath, selfieImagePath）
 * 保持: OCRテキストデータ（idName, idBirthDate, idAddress, idLicenseNumber, idExpiryDate, idDocumentType）
 *
 * Vercel Cron Job で毎日実行を想定
 */
export async function POST(request: NextRequest) {
  // Cron secret による認証（Vercel Cron Jobs はこのヘッダーを送信）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fourDaysAgo = new Date()
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4)

  // 削除対象のユーザーを検索
  const targets = await prisma.user.findMany({
    where: {
      idDocumentPath: { not: null },
      idDocumentUploadedAt: { not: null, lt: fourDaysAgo },
      addressMismatch: false,
      idOcrIssueReport: null,
    },
    select: {
      id: true,
      idDocumentPath: true,
      idDocumentBackPath: true,
      idFacePhotoPath: true,
      selfieImagePath: true,
    },
  })

  let deletedCount = 0
  const errors: string[] = []

  for (const user of targets) {
    try {
      // 画像ファイルを削除
      const paths = [
        user.idDocumentPath,
        user.idDocumentBackPath,
        user.idFacePhotoPath,
        user.selfieImagePath,
      ].filter(Boolean) as string[]

      for (const path of paths) {
        try {
          await deleteFile(path)
        } catch (e) {
          console.warn(`[cleanup] Failed to delete file ${path}:`, e)
        }
      }

      // DBのパスをnullに（OCRテキストデータは保持）
      await prisma.user.update({
        where: { id: user.id },
        data: {
          idDocumentPath: null,
          idDocumentBackPath: null,
          idFacePhotoPath: null,
          selfieImagePath: null,
          faceVerificationResult: null,
          faceVerificationAt: null,
          idDocumentUploadedAt: null,
        },
      })

      deletedCount++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`User ${user.id}: ${msg}`)
      console.error(`[cleanup] Error processing user ${user.id}:`, e)
    }
  }

  console.log(`[cleanup-id-documents] Processed ${targets.length} users, deleted ${deletedCount}, errors: ${errors.length}`)

  return NextResponse.json({
    processed: targets.length,
    deleted: deletedCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}

// GET も対応（Vercel Cron は GET で呼ぶ場合がある）
export async function GET(request: NextRequest) {
  return POST(request)
}
