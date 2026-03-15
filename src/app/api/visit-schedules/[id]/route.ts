import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
      user: { select: { id: true, name: true, address: true, phone: true, customerType: true } },
      store: { select: { id: true, name: true } },
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

    return {
      ...item,
      imageUrls: images.map((_: string, idx: number) =>
        `/api/purchase-items/${item.id}/images/${idx}`
      ),
      aiResearch,
      aiResearchedAt: item.aiResearchedAt,
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
  const { status, note, purchaseAmount, billingAmount } = body

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

  const updated = await prisma.visitSchedule.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, address: true, phone: true } },
      store: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}
