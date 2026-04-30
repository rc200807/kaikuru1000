import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { researchMarketPrice, GeminiError, type ImageData } from '@/lib/gemini'
import { readFile } from 'fs/promises'
import path from 'path'

/**
 * 画像URLからバイナリデータを取得する
 * - ローカルパス (/uploads/...) → fsで読み込み
 * - 外部URL (https://...) → fetchで取得
 */
async function fetchImageData(url: string): Promise<ImageData | null> {
  try {
    if (url.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', url)
      const buffer = await readFile(filePath)
      const ext = path.extname(url).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.webp': 'image/webp',
        '.heic': 'image/heic',
      }
      return { buffer, mimeType: mimeMap[ext] || 'image/jpeg' }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url)
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      return { buffer: Buffer.from(arrayBuffer), mimeType: contentType }
    }

    return null
  } catch (err) {
    console.warn(`[ai-research] 画像取得失敗: ${url}`, err)
    return null
  }
}

/** GET: 保存済みのAI調査結果を取得 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    select: { aiResearch: true, aiResearchedAt: true, visitSchedule: { select: { storeId: true } } },
  })

  if (!item) {
    return NextResponse.json({ error: '品目が見つかりません' }, { status: 404 })
  }

  if (sessionUser.role === 'store' && item.visitSchedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!item.aiResearch) {
    return NextResponse.json({ result: null })
  }

  return NextResponse.json({
    result: JSON.parse(item.aiResearch),
    researchedAt: item.aiResearchedAt,
  })
}

/** POST: AI調査を実行して結果をDBに保存 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    include: { visitSchedule: { select: { storeId: true } } },
  })

  if (!item) {
    return NextResponse.json({ error: '品目が見つかりません' }, { status: 404 })
  }

  if (sessionUser.role === 'store' && item.visitSchedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 画像URLをパースしてバイナリデータを取得
  let rawImageUrls: string[] = []
  try {
    rawImageUrls = JSON.parse(item.imageUrls)
  } catch {
    // パース失敗時は空配列
  }

  const images: ImageData[] = []
  for (const url of rawImageUrls) {
    const imgData = await fetchImageData(url)
    if (imgData) images.push(imgData)
  }

  // 楽天データがあればAI調査プロンプトに追加情報として渡す
  let enrichedItemName = item.itemName
  if (item.rakutenData) {
    try {
      const rData = JSON.parse(item.rakutenData)
      const parts = [item.itemName]
      if (rData.productName && rData.productName !== item.itemName) parts.push(`（楽天: ${rData.productName}）`)
      if (rData.makerName) parts.push(`メーカー: ${rData.makerName}`)
      if (rData.brandName) parts.push(`ブランド: ${rData.brandName}`)
      if (item.janCode) parts.push(`JANコード: ${item.janCode}`)
      if (rData.averagePrice) parts.push(`楽天平均価格: ¥${rData.averagePrice.toLocaleString()}`)
      enrichedItemName = parts.join(' / ')
    } catch { /* ignore */ }
  } else if (item.janCode) {
    enrichedItemName = `${item.itemName} / JANコード: ${item.janCode}`
  }

  // AI調査実行（画像付き + 楽天データ補強）
  let result
  try {
    result = await researchMarketPrice(enrichedItemName, item.category, images)
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = err.reason === 'no-key' ? 503 : 502
      const message = err.reason === 'no-key'
        ? 'AI調査を実行できません。GEMINI_API_KEY が設定されているか確認してください。'
        : err.reason === 'parse-error'
          ? 'AI調査のレスポンスを解釈できませんでした。再試行してください。'
          : `AI調査に失敗しました: ${err.detail ?? err.message}`
      return NextResponse.json({ error: message, reason: err.reason }, { status })
    }
    throw err
  }

  // 結果をDBに保存
  await prisma.purchaseItem.update({
    where: { id: itemId },
    data: {
      aiResearch: JSON.stringify(result),
      aiResearchedAt: new Date(),
    },
  })

  return NextResponse.json(result)
}
