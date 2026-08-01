import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/line/public/[storeCode] — LINE友達登録ページ用の公開情報（認証不要）
// 店舗名と、既定チャネルの利用可否・友だち追加URLのみを返す（秘匿情報は返さない）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await params
    const store = await prisma.store.findUnique({
      where: { code: storeCode },
      select: { name: true, isActive: true },
    })
    if (!store || !store.isActive) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const channel = await prisma.lineChannel.findFirst({
      where: { isDefault: true, isActive: true },
      select: { loginChannelId: true, loginChannelSecret: true, addFriendUrl: true },
    })

    return NextResponse.json({
      storeName: store.name,
      // LINE Login 設定が揃っている場合のみフォームを有効化する
      enabled: !!(channel?.loginChannelId && channel?.loginChannelSecret),
      addFriendUrl: channel?.addFriendUrl || null,
    })
  } catch (error) {
    console.error('[line/public] GET error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
