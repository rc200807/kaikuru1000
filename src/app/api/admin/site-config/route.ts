import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - サイト設定取得（管理者用）
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SiteConfig は1レコードのみ使用
  const config = await prisma.siteConfig.findFirst()

  return NextResponse.json({
    gaTrackingId: config?.gaTrackingId ?? '',
  })
}

// PATCH - サイト設定更新（管理者用）
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { gaTrackingId } = body

  // バリデーション: G-XXXXXXX or UA-XXXXXXX-X 形式、または空文字
  const trimmed = (gaTrackingId ?? '').trim()
  if (trimmed && !/^(G-[A-Z0-9]+|UA-\d+-\d+)$/.test(trimmed)) {
    return NextResponse.json(
      { error: 'トラッキングIDの形式が正しくありません（例: G-XXXXXXXXXX）' },
      { status: 400 }
    )
  }

  const existing = await prisma.siteConfig.findFirst()

  if (existing) {
    await prisma.siteConfig.update({
      where: { id: existing.id },
      data: { gaTrackingId: trimmed || null },
    })
  } else {
    await prisma.siteConfig.create({
      data: { gaTrackingId: trimmed || null },
    })
  }

  return NextResponse.json({ success: true, gaTrackingId: trimmed || null })
}
