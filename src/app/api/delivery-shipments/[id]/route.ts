import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** imageUrls をプロキシURLに変換して返す */
function toClientShipment(s: any) {
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(s.imageUrls || '[]') } catch { /* ignore */ }
  return {
    ...s,
    imageUrls: blobUrls.map((_: string, i: number) => `/api/delivery-shipments/${s.id}/images/${i}`),
  }
}

/**
 * PATCH /api/delivery-shipments/[id]
 *   顧客: status を "shipped" に変更のみ可
 *   店舗: status / purchaseAmount / storeNote を更新可
 *   admin: status / purchaseAmount / storeNote を更新可
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any

  const shipment = await prisma.deliveryShipment.findUnique({ where: { id } })
  if (!shipment) return NextResponse.json({ error: '送付記録が見つかりません' }, { status: 404 })

  const body = await request.json()

  if (sessionUser.role === 'customer') {
    // 自分の送付のみ操作可
    if (shipment.userId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // 顧客は "shipped" への変更のみ許可
    if (body.status !== 'shipped') {
      return NextResponse.json({ error: '顧客は「発送済み」への変更のみできます' }, { status: 403 })
    }
    if (shipment.status !== 'registered') {
      return NextResponse.json({ error: '登録済み状態のみ発送済みに変更できます' }, { status: 409 })
    }

    const updated = await prisma.deliveryShipment.update({
      where: { id },
      data: { status: 'shipped' },
    })
    return NextResponse.json(toClientShipment(updated))

  } else if (sessionUser.role === 'store') {
    // 担当顧客の送付のみ操作可
    const owner = await prisma.user.findUnique({
      where: { id: shipment.userId },
      select: { storeId: true },
    })
    if (owner?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateData: any = {}
    const validStatuses = ['registered', 'shipped', 'received', 'appraised']
    if (body.status !== undefined) {
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
      }
      updateData.status = body.status
    }
    if (body.purchaseAmount !== undefined) {
      updateData.purchaseAmount = body.purchaseAmount === null ? null : Number(body.purchaseAmount)
    }
    if (body.storeNote !== undefined) {
      updateData.storeNote = body.storeNote || null
    }

    const updated = await prisma.deliveryShipment.update({ where: { id }, data: updateData })
    return NextResponse.json(toClientShipment(updated))

  } else if (sessionUser.role === 'admin') {
    const updateData: any = {}
    const validStatuses = ['registered', 'shipped', 'received', 'appraised']
    if (body.status !== undefined) {
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
      }
      updateData.status = body.status
    }
    if (body.purchaseAmount !== undefined) {
      updateData.purchaseAmount = body.purchaseAmount === null ? null : Number(body.purchaseAmount)
    }
    if (body.storeNote !== undefined) {
      updateData.storeNote = body.storeNote || null
    }

    const updated = await prisma.deliveryShipment.update({ where: { id }, data: updateData })
    return NextResponse.json(toClientShipment(updated))

  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
