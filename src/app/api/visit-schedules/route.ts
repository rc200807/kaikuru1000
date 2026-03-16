import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent } from '@/lib/google-calendar'

// 訪問スケジュール一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')
  const userId = searchParams.get('userId')

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))

  const where: any = {}
  if (storeId) where.storeId = storeId
  if (userId) where.userId = userId
  if (sessionUser.role === 'customer') where.userId = sessionUser.id
  if (sessionUser.role === 'store') where.storeId = sessionUser.id

  const [schedules, total] = await Promise.all([
    prisma.visitSchedule.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, address: true, phone: true } },
        store: { select: { id: true, name: true } },
        salesContract: { select: { id: true } },
      },
      orderBy: { visitDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.visitSchedule.count({ where }),
  ])

  return NextResponse.json({ schedules, total, page, limit })
}

// 訪問スケジュール登録（店舗・管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { userId, storeId, visitDate, note } = body

  if (!userId || !storeId || !visitDate) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.create({
    data: {
      userId, storeId,
      visitDate: new Date(visitDate),
      note,
      status: 'scheduled',
    },
    include: {
      user: { select: { name: true, address: true } },
      store: { select: { name: true } },
    },
  })

  // Googleカレンダーにイベントを同期（失敗してもスケジュール登録は成功とする）
  try {
    const eventId = await createCalendarEvent(storeId, {
      visitDate: new Date(visitDate),
      note,
      user: {
        name: schedule.user.name,
        address: schedule.user.address ?? '',
      },
    })
    if (eventId) {
      await prisma.visitSchedule.update({
        where: { id: schedule.id },
        data: { googleCalendarEventId: eventId },
      })
    }
  } catch (err) {
    console.error('[GoogleCalendar] スケジュール作成時のカレンダー同期に失敗:', err)
  }

  return NextResponse.json(schedule, { status: 201 })
}
