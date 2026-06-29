import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent } from '@/lib/google-calendar'
import { ensureDealForVisit } from '@/lib/ensure-deal'

// 訪問リクエスト詳細
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const visitRequest = await prisma.visitRequest.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { name: true } },
    },
  })

  if (!visitRequest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(visitRequest)
}

// 訪問リクエスト更新（アクション別）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const body = await request.json()
  const { action } = body

  const visitRequest = await prisma.visitRequest.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, address: true, customerType: true } },
    },
  })

  if (!visitRequest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 店舗アクション: 承認
  if (action === 'approve' && sessionUser.role === 'store') {
    if (visitRequest.status !== 'pending') {
      return NextResponse.json({ error: 'このリクエストは承認できません' }, { status: 400 })
    }

    const { approvedCandidate } = body as { approvedCandidate: 1 | 2 | 3 }

    // 選択された候補の日時を取得
    let visitDate: Date
    let startTime: string | null
    let endTime: string | null

    if (approvedCandidate === 1) {
      visitDate = visitRequest.candidate1Date
      startTime = visitRequest.candidate1Start
      endTime = visitRequest.candidate1End
    } else if (approvedCandidate === 2) {
      visitDate = visitRequest.candidate2Date
      startTime = visitRequest.candidate2Start
      endTime = visitRequest.candidate2End
    } else {
      visitDate = visitRequest.candidate3Date
      startTime = visitRequest.candidate3Start
      endTime = visitRequest.candidate3End
    }

    // トランザクションでVisitSchedule作成 + リクエスト更新
    const result = await prisma.$transaction(async (tx) => {
      const dealId = await ensureDealForVisit(tx, {
        userId: visitRequest.userId,
        storeId: visitRequest.storeId,
        createdBy: { type: sessionUser?.role ?? null, id: sessionUser?.id ?? null, name: sessionUser?.name ?? null },
      })
      const schedule = await tx.visitSchedule.create({
        data: {
          userId: visitRequest.userId,
          storeId: visitRequest.storeId,
          dealId,
          visitDate,
          startTime,
          endTime,
          status: 'scheduled',
          note: '訪問リクエストより作成',
        },
      })

      const updated = await tx.visitRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedCandidate,
          visitScheduleId: schedule.id,
        },
        include: {
          user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
          store: { select: { name: true } },
        },
      })

      return { schedule, updated }
    })

    // Googleカレンダー同期（失敗してもリクエスト承認は成功とする）
    try {
      const eventId = await createCalendarEvent(visitRequest.storeId, {
        visitDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        note: '訪問リクエストより作成',
        customerType: visitRequest.user.customerType ?? undefined,
        user: {
          name: visitRequest.user.name,
          address: visitRequest.user.address ?? '',
        },
      })
      if (eventId) {
        await prisma.visitSchedule.update({
          where: { id: result.schedule.id },
          data: { googleCalendarEventId: eventId },
        })
      }
    } catch (err) {
      console.error('[GoogleCalendar] 訪問リクエスト承認時のカレンダー同期に失敗:', err)
    }

    return NextResponse.json(result.updated)
  }

  // 店舗アクション: 逆提案
  if (action === 'counter_propose' && sessionUser.role === 'store') {
    if (visitRequest.status !== 'pending') {
      return NextResponse.json({ error: 'このリクエストには逆提案できません' }, { status: 400 })
    }

    const { counterDate, counterStart, counterEnd, storeNote } = body

    const updated = await prisma.visitRequest.update({
      where: { id },
      data: {
        status: 'counter_proposed',
        counterDate: new Date(counterDate),
        counterStart: counterStart || null,
        counterEnd: counterEnd || null,
        storeNote: storeNote || null,
      },
      include: {
        user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
        store: { select: { name: true } },
      },
    })

    return NextResponse.json(updated)
  }

  // 顧客アクション: 逆提案を受諾
  if (action === 'accept_counter' && sessionUser.role === 'customer') {
    if (visitRequest.status !== 'counter_proposed') {
      return NextResponse.json({ error: 'この逆提案は受諾できません' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const dealId = await ensureDealForVisit(tx, {
        userId: visitRequest.userId,
        storeId: visitRequest.storeId,
        createdBy: { type: sessionUser?.role ?? null, id: sessionUser?.id ?? null, name: sessionUser?.name ?? null },
      })
      const schedule = await tx.visitSchedule.create({
        data: {
          userId: visitRequest.userId,
          storeId: visitRequest.storeId,
          dealId,
          visitDate: visitRequest.counterDate!,
          startTime: visitRequest.counterStart,
          endTime: visitRequest.counterEnd,
          status: 'scheduled',
          note: '訪問リクエストより作成',
        },
      })

      const updated = await tx.visitRequest.update({
        where: { id },
        data: {
          status: 'customer_accepted',
          visitScheduleId: schedule.id,
        },
        include: {
          user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
          store: { select: { name: true } },
        },
      })

      return { schedule, updated }
    })

    // Googleカレンダー同期
    try {
      const eventId = await createCalendarEvent(visitRequest.storeId, {
        visitDate: visitRequest.counterDate!,
        startTime: visitRequest.counterStart || undefined,
        endTime: visitRequest.counterEnd || undefined,
        note: '訪問リクエストより作成',
        customerType: visitRequest.user.customerType ?? undefined,
        user: {
          name: visitRequest.user.name,
          address: visitRequest.user.address ?? '',
        },
      })
      if (eventId) {
        await prisma.visitSchedule.update({
          where: { id: result.schedule.id },
          data: { googleCalendarEventId: eventId },
        })
      }
    } catch (err) {
      console.error('[GoogleCalendar] 逆提案受諾時のカレンダー同期に失敗:', err)
    }

    return NextResponse.json(result.updated)
  }

  // 顧客アクション: 逆提案を辞退
  if (action === 'decline_counter' && sessionUser.role === 'customer') {
    if (visitRequest.status !== 'counter_proposed') {
      return NextResponse.json({ error: 'この逆提案は辞退できません' }, { status: 400 })
    }

    const updated = await prisma.visitRequest.update({
      where: { id },
      data: { status: 'customer_declined' },
      include: {
        user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
        store: { select: { name: true } },
      },
    })

    return NextResponse.json(updated)
  }

  // 顧客アクション: キャンセル
  if (action === 'cancel' && sessionUser.role === 'customer') {
    if (visitRequest.status !== 'pending' && visitRequest.status !== 'counter_proposed') {
      return NextResponse.json({ error: 'このリクエストはキャンセルできません' }, { status: 400 })
    }

    const updated = await prisma.visitRequest.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
        store: { select: { name: true } },
      },
    })

    return NextResponse.json(updated)
  }

  // 顧客アクション: 店舗提案を承認（requestedBy='store'のリクエストに対して）
  if (action === 'approve_store_proposal' && sessionUser.role === 'customer') {
    if (visitRequest.status !== 'pending' || !('requestedBy' in visitRequest) ) {
      return NextResponse.json({ error: 'この提案は承認できません' }, { status: 400 })
    }

    const { approvedCandidate } = body as { approvedCandidate: 1 | 2 | 3 }

    let visitDate: Date
    let startTime: string | null
    let endTime: string | null

    if (approvedCandidate === 1) {
      visitDate = visitRequest.candidate1Date
      startTime = visitRequest.candidate1Start
      endTime = visitRequest.candidate1End
    } else if (approvedCandidate === 2) {
      visitDate = visitRequest.candidate2Date
      startTime = visitRequest.candidate2Start
      endTime = visitRequest.candidate2End
    } else {
      visitDate = visitRequest.candidate3Date
      startTime = visitRequest.candidate3Start
      endTime = visitRequest.candidate3End
    }

    const result = await prisma.$transaction(async (tx) => {
      const dealId = await ensureDealForVisit(tx, {
        userId: visitRequest.userId,
        storeId: visitRequest.storeId,
        createdBy: { type: sessionUser?.role ?? null, id: sessionUser?.id ?? null, name: sessionUser?.name ?? null },
      })
      const schedule = await tx.visitSchedule.create({
        data: {
          userId: visitRequest.userId,
          storeId: visitRequest.storeId,
          dealId,
          visitDate,
          startTime,
          endTime,
          status: 'scheduled',
          note: '店舗からの訪問提案より作成',
        },
      })

      const updated = await tx.visitRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedCandidate,
          visitScheduleId: schedule.id,
        },
        include: {
          user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
          store: { select: { name: true } },
        },
      })

      return { schedule, updated }
    })

    // Googleカレンダー同期
    try {
      const eventId = await createCalendarEvent(visitRequest.storeId, {
        visitDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        note: '店舗からの訪問提案より作成',
        customerType: visitRequest.user.customerType ?? undefined,
        user: {
          name: visitRequest.user.name,
          address: visitRequest.user.address ?? '',
        },
      })
      if (eventId) {
        await prisma.visitSchedule.update({
          where: { id: result.schedule.id },
          data: { googleCalendarEventId: eventId },
        })
      }
    } catch (err) {
      console.error('[GoogleCalendar] 店舗提案承認時のカレンダー同期に失敗:', err)
    }

    return NextResponse.json(result.updated)
  }

  // 顧客アクション: 店舗提案を辞退
  if (action === 'decline_store_proposal' && sessionUser.role === 'customer') {
    if (visitRequest.status !== 'pending') {
      return NextResponse.json({ error: 'この提案は辞退できません' }, { status: 400 })
    }

    const updated = await prisma.visitRequest.update({
      where: { id },
      data: { status: 'customer_declined' },
      include: {
        user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
        store: { select: { name: true } },
      },
    })

    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: '不正なアクションです' }, { status: 400 })
}
