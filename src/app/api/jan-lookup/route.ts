import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchByJanCode } from '@/lib/rakuten'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/jan-lookup
 * JANコードから楽天商品検索APIで商品情報を取得する
 * 楽天App IDはDB（SiteConfig）または環境変数から取得
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { janCode } = body

  if (!janCode || typeof janCode !== 'string') {
    return NextResponse.json({ error: 'JANコードが指定されていません' }, { status: 400 })
  }

  const cleaned = janCode.trim()
  if (!/^\d{8}$|^\d{13}$/.test(cleaned)) {
    return NextResponse.json(
      { error: 'JANコードの形式が正しくありません（8桁または13桁の数字）' },
      { status: 400 }
    )
  }

  // DBから楽天App IDを取得（環境変数をフォールバック）
  const siteConfig = await prisma.siteConfig.findFirst({ select: { rakutenAppId: true } })
  const appId = siteConfig?.rakutenAppId || process.env.RAKUTEN_APP_ID

  if (!appId) {
    return NextResponse.json(
      { error: '楽天APIが設定されていません。管理画面の「設定」から楽天アプリIDを登録してください。' },
      { status: 503 }
    )
  }

  const product = await searchByJanCode(cleaned, appId)

  if (!product) {
    return NextResponse.json(
      { error: '商品が見つかりませんでした', janCode: cleaned },
      { status: 404 }
    )
  }

  return NextResponse.json(product)
}
