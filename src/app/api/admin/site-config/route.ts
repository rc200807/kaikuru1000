import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - サイト設定取得（管理者用）
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SiteConfig は1レコードのみ使用
  const config = await prisma.siteConfig.findFirst()

  return NextResponse.json({
    rakutenAppId: config?.rakutenAppId ?? '',
  })
}

// PATCH - サイト設定更新（管理者用）
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { rakutenAppId } = body

  // Google Analytics は廃止（自前のアクセス解析に一本化）。gaTrackingId は受け付けない
  const updateData: any = {}

  if (rakutenAppId !== undefined) {
    updateData.rakutenAppId = (rakutenAppId ?? '').trim() || null
  }

  const existing = await prisma.siteConfig.findFirst()

  if (existing) {
    await prisma.siteConfig.update({
      where: { id: existing.id },
      data: updateData,
    })
  } else {
    await prisma.siteConfig.create({
      data: updateData,
    })
  }

  const updated = await prisma.siteConfig.findFirst()

  return NextResponse.json({
    success: true,
    rakutenAppId: updated?.rakutenAppId ?? null,
  })
}
