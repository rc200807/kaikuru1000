import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  const { workName, unitPrice, quantity } = body

  if (!workName) {
    return NextResponse.json({ error: '作業名は必須です' }, { status: 400 })
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: {
        visitScheduleId: id,
        workName,
        unitPrice: unitPrice ?? 0,
        quantity: quantity ?? 1,
      },
    })

    // billingAmount 再計算
    const allItems = await tx.workItem.findMany({ where: { visitScheduleId: id } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id }, data: { billingAmount: total } })

    return created
  })

  return NextResponse.json(item, { status: 201 })
}
