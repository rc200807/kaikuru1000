import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 買取品目画像を認証プロキシ経由で配信
 * GET /api/purchase-items/[itemId]/images/[index]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string; index: string }> },
) {
  const { itemId, index: indexStr } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  const item = await prisma.purchaseItem.findUnique({
    where: { id: itemId },
    include: { visitSchedule: { select: { storeId: true, userId: true } } },
  })
  if (!item) return NextResponse.json({ error: '品目が見つかりません' }, { status: 404 })

  // 認可チェック
  if (sessionUser.role === 'customer') {
    if (item.visitSchedule.userId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (sessionUser.role === 'store') {
    if (item.visitSchedule.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて閲覧可

  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }

  const index = parseInt(indexStr, 10)
  if (isNaN(index) || index < 0 || index >= blobUrls.length) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  const blobUrl = blobUrls[index]

  // ローカル開発: 静的ファイルにリダイレクト
  if (!blobUrl.startsWith('https://')) {
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

  // 本番: プロキシ配信
  try {
    const res = await fetch(blobUrl)
    if (!res.ok) return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 500 })
  }
}
