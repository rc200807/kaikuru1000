import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { recordAccessLog } from '@/lib/access-log'

const VALID_STATUSES = ['scheduled', 'pending', 'completed', 'rescheduled', 'absent', 'cancelled', 'revisit']

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
      user: { select: { id: true, name: true, address: true, phone: true, email: true, customerType: true, occupation: true, leadSource: true, idAddress: true, idName: true, idDocumentType: true, idDocumentPath: true, idDocumentBackPath: true, idBirthDate: true, idLicenseNumber: true } },
      store: {
        select: {
          id: true, name: true, address: true, phone: true,
          operator: {
            select: {
              id: true,
              entityType: true,
              corporatePrefix: true,
              prefixPosition: true,
              name: true,
              address: true,
              representativeName: true,
            },
          },
        },
      },
      deal: { select: { id: true, status: true, purchaseUpliftPercent: true } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ閲覧可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 品目は「案件」配下を正とする（再ペアレント後）。dealId 基準で取得し、無ければ従来の訪問基準。
  const itemWhere = schedule.dealId ? { dealId: schedule.dealId } : { visitScheduleId: id }
  const [purchaseItemsRaw, workItemsRaw] = await Promise.all([
    prisma.purchaseItem.findMany({ where: itemWhere, orderBy: { createdAt: 'asc' }, include: { inventoryItem: { select: { id: true } } } }),
    prisma.workItem.findMany({ where: itemWhere, orderBy: { createdAt: 'asc' } }),
  ])

  // purchaseItems の imageUrls をプロキシURLに変換 + aiResearch をパース
  const items = purchaseItemsRaw.map((item) => {
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
      convertedInventoryId: item.inventoryItem?.id ?? null,
    }
  })

  return NextResponse.json({
    ...schedule,
    purchaseItems: items,
    workItems: workItemsRaw,
    purchaseUpliftPercent: schedule.deal?.purchaseUpliftPercent ?? 0,
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
  const { status, note, purchaseAmount, billingAmount, preConsentSignature, staffName, revisitDate, revisitStart, revisitEnd, revisitNote, supplementaryDocs, dealId } = body

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
  if (revisitDate !== undefined) updateData.revisitDate = revisitDate ? new Date(revisitDate) : null
  if (revisitStart !== undefined) updateData.revisitStart = revisitStart || null
  if (revisitEnd !== undefined) updateData.revisitEnd = revisitEnd || null
  if (revisitNote !== undefined) updateData.revisitNote = revisitNote || null
  if (supplementaryDocs !== undefined) updateData.supplementaryDocs = supplementaryDocs
  if (dealId !== undefined) updateData.dealId = dealId || null

  const updated = await prisma.visitSchedule.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, address: true, phone: true } },
      store: { select: { id: true, name: true } },
      deal: { select: { id: true, status: true } },
    },
  })

  // 事前同意は案件単位の正へ伝播（案件詳細の事前同意状況と一致させる）
  if (preConsentSignature !== undefined && schedule.dealId) {
    try {
      await prisma.deal.update({
        where: { id: schedule.dealId },
        data: { preConsentSignature: preConsentSignature || null, preConsentAt: preConsentSignature ? new Date() : null },
      })
    } catch (e) {
      console.error('[visit PATCH] 案件への事前同意伝播に失敗:', e)
    }
  }

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

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: '訪問記録を更新', req: request })
  return NextResponse.json(updated)
}
