import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 公開サイト設定（GA トラッキングIDなど）
// 認証不要: レイアウトから呼び出される
export async function GET() {
  const config = await prisma.siteConfig.findFirst({
    select: { gaTrackingId: true },
  })

  return NextResponse.json({
    gaTrackingId: config?.gaTrackingId ?? null,
  })
}
