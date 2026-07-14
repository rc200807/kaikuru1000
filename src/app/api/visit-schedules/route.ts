import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent, createCalendarInvitation } from '@/lib/google-calendar'
import { recordAccessLog } from '@/lib/access-log'
import { DEAL_AUTO_ADVANCE_FROM } from '@/lib/deal-status'
import { ensureDealForVisit } from '@/lib/ensure-deal'

// 訪問スケジュール一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')
  const userId = searchParams.get('userId')
  const dealId = searchParams.get('dealId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))

  const where: any = {}
  if (storeId) where.storeId = storeId
  if (userId) where.userId = userId
  if (dealId) where.dealId = dealId
  if (sessionUser.role === 'customer') where.userId = sessionUser.id
  if (sessionUser.role === 'store') where.storeId = sessionUser.id
  // 訪問日の範囲フィルタ（週間カレンダー等での絞り込み用）
  if (from || to) {
    where.visitDate = {}
    if (from) where.visitDate.gte = new Date(from)
    if (to) where.visitDate.lte = new Date(to)
  }

  const [schedules, total] = await Promise.all([
    prisma.visitSchedule.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, address: true, phone: true } },
        store: { select: { id: true, name: true } },
        deal: { select: { id: true, status: true } },
        salesContract: { select: { id: true, createdAt: true } },
        purchaseItems: { select: { id: true, itemName: true, category: true, quantity: true, purchasePrice: true } },
        workItems: { select: { id: true, workName: true, quantity: true, unitPrice: true } },
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
  const { userId, storeId, visitDate, startTime, endTime, note, dealId } = body

  if (!userId || !storeId || !visitDate) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  // 訪問には必ず案件を紐づける（無ければ自動生成。作成者はセッションの実行者）
  const finalDealId = await ensureDealForVisit(prisma, {
    userId, storeId, dealId,
    createdBy: { type: sessionUser?.role ?? null, id: sessionUser?.id ?? null, name: sessionUser?.name ?? null },
  })

  const schedule = await prisma.visitSchedule.create({
    data: {
      userId, storeId,
      dealId: finalDealId,
      visitDate: new Date(visitDate),
      startTime: startTime || null,
      endTime: endTime || null,
      note,
      status: 'scheduled',
      memberId: sessionUser?.memberId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, address: true, phone: true, internalNote: true, customerType: true } },
      store: { select: { name: true, calendarInviteEmail: true } },
    },
  })

  // 案件に紐づく訪問予定が作成されたら、案件ステータスを「訪問決定」へ前進（前進のみ・終端は変更しない）
  if (schedule.dealId) {
    try {
      await prisma.deal.updateMany({
        where: { id: schedule.dealId, status: { in: DEAL_AUTO_ADVANCE_FROM.visit_decided } },
        data: { status: 'visit_decided' },
      })
    } catch (e) {
      console.error('[Deal] 訪問決定への自動遷移に失敗:', e)
    }
  }

  // Googleカレンダーにイベントを同期（失敗してもスケジュール登録は成功とする）
  try {
    const eventId = await createCalendarEvent(storeId, {
      visitDate: new Date(visitDate),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      note,
      customerType: schedule.user.customerType ?? undefined,
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

  // Googleカレンダー招待送信（store.calendarInviteEmail が設定されている場合）
  try {
    if (schedule.store.calendarInviteEmail) {
      let deal: { id: string; detail: string | null } | null = null
      if (dealId) {
        deal = await prisma.deal.findUnique({
          where: { id: dealId },
          select: { id: true, detail: true },
        })
      }
      const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
      await createCalendarInvitation({
        inviteEmail: schedule.store.calendarInviteEmail,
        visitDate: new Date(visitDate),
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        user: {
          id: schedule.user.id,
          name: schedule.user.name,
          phone: schedule.user.phone,
          address: schedule.user.address,
          internalNote: schedule.user.internalNote,
        },
        deal,
        visitScheduleId: schedule.id,
        note,
        baseUrl,
      })
    }
  } catch (err) {
    console.error('[GoogleCalendar] カレンダー招待送信に失敗:', err)
  }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '訪問予定を作成', req: request })
  return NextResponse.json(schedule, { status: 201 })
}
