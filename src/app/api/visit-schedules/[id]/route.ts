import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'

const VALID_STATUSES = ['scheduled', 'pending', 'completed', 'rescheduled', 'absent', 'cancelled']

/** 訪問詳細取得（買取品目・作業品目含む） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, address: true, phone: true, customerType: true, idAddress: true, idName: true } },
      store: { select: { id: true, name: true, address: true, phone: true } },
      purchaseItems: { orderBy: { createdAt: 'asc' } },
      workItems: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ閲覧可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // purchaseItems の imageUrls をプロキシURLに変換 + aiResearch をパース
  const items = schedule.purchaseItems.map((item) => {
    let images: string[] = []
    try { images = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }

    let aiResearch = null
    if (item.aiResearch) {
      try { aiResearch = JSON.parse(item.aiResearch) } catch { /* ignore */ }
    }

    let rakutenData = null
    if (item.rakutenData) {
      try { rakutenData = JSON.parse(item.rakutenData) } catch { /* ignore */ }
    }

    return {
      ...item,
      imageUrls: images.map((_: string, idx: number) =>
        `/api/purchase-items/${item.id}/images/${idx}`
      ),
      aiResearch,
      aiResearchedAt: item.aiResearchedAt,
      janCode: item.janCode,
      rakutenData,
    }
  })

  return NextResponse.json({
    ...schedule,
    purchaseItems: items,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, note, purchaseAmount, billingAmount, preConsentSignature, staffName } = body

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }

  const schedule = await prisma.visitSchedule.findUnique({ where: { id } })
  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ更新可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updateData: any = {}
  if (status !== undefined) updateData.status = status
  if (note !== undefined) updateData.note = note
  if (purchaseAmount !== undefined) updateData.purchaseAmount = purchaseAmount
  if (billingAmount !== undefined) updateData.billingAmount = billingAmount
  if (preConsentSignature !== undefined) {
    updateData.preConsentSignature = preConsentSignature
    updateData.preConsentAt = new Date()
  }
  if (staffName !== undefined) updateData.staffName = staffName

  const updated = await prisma.visitSchedule.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, address: true, phone: true } },
      store: { select: { id: true, name: true } },
    },
  })

  // Googleカレンダー同期（失敗してもスケジュール更新は成功とする）
  try {
    if (status === 'cancelled') {
      // キャンセル時はカレンダーイベントを削除
      await deleteCalendarEvent(schedule.storeId, schedule.googleCalendarEventId)
    } else if (schedule.googleCalendarEventId) {
      // その他の更新時はカレンダーイベントを更新
      await updateCalendarEvent(schedule.storeId, schedule.googleCalendarEventId, {
        visitDate: updated.visitDate,
        note: updated.note,
        user: {
          name: updated.user.name,
          address: updated.user.address ?? '',
        },
      })
    }
  } catch (err) {
    console.error('[GoogleCalendar] スケジュール更新時のカレンダー同期に失敗:', err)
  }

  return NextResponse.json(updated)
}
