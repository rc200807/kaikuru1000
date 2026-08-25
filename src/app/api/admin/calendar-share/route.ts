import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

const FIELDS = [
  'calendarShareAddress',
  'calendarShareVisitNote',
  'calendarShareDealDetail',
  'calendarShareInternalNote',
  'calendarShareLinks',
] as const

/**
 * 訪問スケジュールをGoogleカレンダー（店舗連携カレンダー・本部office@rcinc.jpからの招待）に
 * 登録する際、説明欄・場所欄に何を含めるかの設定（SiteConfigの1レコードに保存）。
 * 実際の組み立ては src/lib/google-calendar.ts の getCalendarShareSettings() が読む。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as { role?: string } | undefined
  if (!session || !sessionUser?.role || !ADMIN_ROLES.includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.siteConfig.findFirst({
    select: {
      calendarShareAddress: true,
      calendarShareVisitNote: true,
      calendarShareDealDetail: true,
      calendarShareInternalNote: true,
      calendarShareLinks: true,
    },
  })

  // レコード未作成でもモデルの既定値（すべてtrue）と同じ値を返す
  return NextResponse.json({
    calendarShareAddress: config?.calendarShareAddress ?? true,
    calendarShareVisitNote: config?.calendarShareVisitNote ?? true,
    calendarShareDealDetail: config?.calendarShareDealDetail ?? true,
    calendarShareInternalNote: config?.calendarShareInternalNote ?? true,
    calendarShareLinks: config?.calendarShareLinks ?? true,
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as { role?: string } | undefined
  if (!session || !sessionUser?.role || !ADMIN_ROLES.includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const updateData: Record<string, boolean> = {}
  for (const key of FIELDS) {
    if (typeof body[key] === 'boolean') updateData[key] = body[key]
  }

  const existing = await prisma.siteConfig.findFirst({ select: { id: true } })
  if (existing) {
    await prisma.siteConfig.update({ where: { id: existing.id }, data: updateData })
  } else {
    await prisma.siteConfig.create({ data: updateData })
  }

  return NextResponse.json({ success: true })
}
