import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { appraiseForPurchase, type ImageData } from '@/lib/gemini'

const MONTHLY_LIMIT = 10

/**
 * 買取相談メモ AI査定
 * POST /api/purchase-memos/[id]/ai-appraisal
 *
 * - 顧客のみ（自分のメモのみ）
 * - 月10回制限
 * - メモの画像をfetchしてGeminiに送信
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // メモ取得 & 所有者チェック
  const memo = await prisma.purchaseMemo.findUnique({ where: { id } })
  if (!memo) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 })
  if (memo.userId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 月間利用回数チェック
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const usedCount = await prisma.purchaseMemo.count({
    where: {
      userId: sessionUser.id,
      aiAppraisalAt: { gte: startOfMonth },
    },
  })

  if (usedCount >= MONTHLY_LIMIT) {
    return NextResponse.json(
      { error: `AI査定は月${MONTHLY_LIMIT}回まで利用できます（今月の利用: ${usedCount}回）` },
      { status: 429 },
    )
  }

  // メモの画像を取得
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(memo.imageUrls || '[]') } catch { /* ignore */ }

  const images: ImageData[] = []
  for (const url of blobUrls) {
    try {
      // ローカル開発の場合はスキップ（Blob URLのみ対応）
      if (!url.startsWith('https://')) continue

      const res = await fetch(url)
      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const arrayBuffer = await res.arrayBuffer()
      images.push({
        buffer: Buffer.from(arrayBuffer),
        mimeType: contentType,
      })
    } catch {
      // 個別の画像取得失敗は無視して続行
      console.warn(`[ai-appraisal] 画像取得失敗: ${url}`)
    }
  }

  // Gemini AI査定実行
  const result = await appraiseForPurchase(
    memo.title,
    memo.description,
    images,
  )

  if (!result) {
    return NextResponse.json(
      { error: 'AI査定に失敗しました。しばらく経ってから再度お試しください。' },
      { status: 500 },
    )
  }

  // 結果をDBに保存
  const updated = await prisma.purchaseMemo.update({
    where: { id },
    data: {
      aiAppraisal: JSON.stringify(result),
      aiAppraisalAt: new Date(),
    },
  })

  // 今月の残り回数を計算
  const remaining = MONTHLY_LIMIT - (usedCount + 1)

  return NextResponse.json({
    appraisal: result,
    aiAppraisalAt: updated.aiAppraisalAt,
    remaining,
  })
}

/**
 * 今月のAI査定利用状況を取得
 * GET /api/purchase-memos/[id]/ai-appraisal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  void id // パスパラメータは使わないが型整合のため受け取る

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const usedCount = await prisma.purchaseMemo.count({
    where: {
      userId: sessionUser.id,
      aiAppraisalAt: { gte: startOfMonth },
    },
  })

  return NextResponse.json({
    used: usedCount,
    limit: MONTHLY_LIMIT,
    remaining: MONTHLY_LIMIT - usedCount,
  })
}
