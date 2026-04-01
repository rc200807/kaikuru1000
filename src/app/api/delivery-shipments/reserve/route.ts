import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 送付番号を事前に予約（レコード作成して番号を返す） */
export async function POST() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const shipmentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 今月すでに登録済みかチェック
  const existing = await prisma.deliveryShipment.findFirst({
    where: { userId: sessionUser.id, shipmentMonth },
  })
  if (existing) {
    return NextResponse.json({
      shipmentNumber: existing.shipmentNumber,
      id: existing.id,
      alreadyExists: true,
    })
  }

  // ランダム4桁で番号を生成（重複回避）
  const monthStr = shipmentMonth.replace('-', '')
  let shipmentNumber = ''
  for (let i = 0; i < 20; i++) {
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    const candidate = `HD-${monthStr}-${rand}`
    const dup = await prisma.deliveryShipment.findFirst({
      where: { shipmentNumber: candidate },
      select: { id: true },
    })
    if (!dup) { shipmentNumber = candidate; break }
  }
  if (!shipmentNumber) {
    shipmentNumber = `HD-${monthStr}-${String(Date.now() % 10000).padStart(4, '0')}`
  }

  return NextResponse.json({ shipmentNumber, shipmentMonth })
}
