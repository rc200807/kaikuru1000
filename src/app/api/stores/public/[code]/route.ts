import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 店舗の公開情報を取得（認証不要）
 * GET /api/stores/public/:code
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!code) {
    return NextResponse.json({ error: '店舗コードが必要です' }, { status: 400 })
  }

  try {
    const store = await prisma.store.findUnique({
      where: { code },
      select: {
        name: true,
        address: true,
        phone: true,
        isActive: true,
      },
    })

    if (!store || !store.isActive) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    return NextResponse.json({
      name: store.name,
      address: store.address,
      phone: store.phone,
    })
  } catch (error) {
    console.error('店舗公開情報取得エラー:', error)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
