import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recomputeDealAmounts } from '@/lib/deal-amounts'
import { isDealContracted, DEAL_LOCKED_MESSAGE } from '@/lib/deal-lock'

/** 作業品目一覧取得 */
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

  const schedule = await prisma.visitSchedule.findUnique({ where: { id } })
  if (!schedule) return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })

  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const items = await prisma.workItem.findMany({
    where: { visitScheduleId: id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(items)
}

/** 作業品目を追加（billingAmount自動再計算） */
export async function POST(
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

  const schedule = await prisma.visitSchedule.findUnique({ where: { id } })
  if (!schedule) return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })

  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }


  // 売買契約書の発行後は取引内容を凍結する
  if (await isDealContracted(schedule.dealId)) {
    return NextResponse.json({ error: DEAL_LOCKED_MESSAGE }, { status: 409 })
  }

  const { workName, unitPrice, quantity, notes } = body

  if (!workName) {
    return NextResponse.json({ error: '作業名は必須です' }, { status: 400 })
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: {
        visitScheduleId: id,
        dealId: schedule.dealId,  // 案件にも紐づける（再ペアレント後の正・両系統を同期）
        workName,
        unitPrice: unitPrice ?? 0,
        quantity: quantity ?? 1,
        notes: notes || null,
      },
    })

    // billingAmount 再計算（訪問＝後方互換／案件＝正）
    const allItems = await tx.workItem.findMany({ where: { visitScheduleId: id } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id }, data: { billingAmount: total } })
    if (schedule.dealId) await recomputeDealAmounts(tx, schedule.dealId)

    return created
  })

  return NextResponse.json(item, { status: 201 })
}
