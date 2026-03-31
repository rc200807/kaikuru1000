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

  // 番号を生成
  const count = await prisma.deliveryShipment.count({ where: { shipmentMonth } })
  const seq = String(count + 1).padStart(4, '0')
  const monthStr = shipmentMonth.replace('-', '')
  const shipmentNumber = `HD-${monthStr}-${seq}`

  return NextResponse.json({ shipmentNumber, shipmentMonth })
}
