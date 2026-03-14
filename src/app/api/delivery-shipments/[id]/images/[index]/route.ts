import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 宅配買取送付画像を認証プロキシ経由で配信
 * Blob URL をクライアントに露出させず、認証・認可チェック後にコンテンツを返す
 *
 * GET /api/delivery-shipments/[id]/images/[index]
 *   - 顧客: 自分の送付のみ
 *   - 店舗: 担当顧客の送付のみ
 *   - 管理者: すべて
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index: indexStr } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  const shipment = await prisma.deliveryShipment.findUnique({ where: { id } })
  if (!shipment) return NextResponse.json({ error: '送付記録が見つかりません' }, { status: 404 })

  // 認可チェック
  if (sessionUser.role === 'customer') {
    if (shipment.userId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (sessionUser.role === 'store') {
    const owner = await prisma.user.findUnique({
      where: { id: shipment.userId },
      select: { storeId: true },
    })
    if (owner?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  // admin はすべて閲覧可

  // imageUrls は DB に JSON 文字列で保存されている
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(shipment.imageUrls || '[]') } catch { /* ignore */ }

  const index = parseInt(indexStr, 10)
  if (isNaN(index) || index < 0 || index >= blobUrls.length) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  const blobUrl = blobUrls[index]

  // ローカル開発（/uploads/...）: 静的ファイルにリダイレクト
  if (!blobUrl.startsWith('https://')) {
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

  // 本番: プロキシ配信（Blob URL をクライアントに露出しない）
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
