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

/** 宅配買取番号を生成: HD-YYYYMM-NNNN */
async function generateShipmentNumber(shipmentMonth: string): Promise<string> {
  const count = await prisma.deliveryShipment.count({
    where: { shipmentMonth },
  })
  const seq = String(count + 1).padStart(4, '0')
  const monthStr = shipmentMonth.replace('-', '') // "202603"
  return `HD-${monthStr}-${seq}`
}

/** GET /api/delivery-shipments
 * 顧客: 自分の送付一覧
 * 店舗: ?userId= で指定（担当顧客のみ）
 * admin: ?userId= で絞込
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  let targetUserId: string

  if (sessionUser.role === 'customer') {
    targetUserId = sessionUser.id
  } else if (sessionUser.role === 'store') {
    if (!userId) return NextResponse.json({ error: 'userId が必要です' }, { status: 400 })
    // 担当顧客かチェック
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { storeId: true } })
    if (target?.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    targetUserId = userId
  } else if (sessionUser.role === 'admin') {
    if (!userId) return NextResponse.json({ error: 'userId が必要です' }, { status: 400 })
    targetUserId = userId
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipments = await prisma.deliveryShipment.findMany({
    where: { userId: targetUserId },
    orderBy: { shipmentMonth: 'desc' },
  })

  return NextResponse.json(shipments.map(toClientShipment))
}

/** POST /api/delivery-shipments
 * 顧客のみ: 今月の送付登録（1ヶ月1件制限）
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = sessionUser.id

  // 顧客タイプ確認
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { customerType: true } })
  if (user?.customerType !== 'delivery') {
    return NextResponse.json({ error: '宅配買取顧客のみ送付登録できます' }, { status: 403 })
  }

  const body = await request.json()
  const { description, imageUrls } = body

  // 当月を YYYY-MM 形式で取得（JST）
  const now = new Date()
  const shipmentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 当月の重複チェック
  const existing = await prisma.deliveryShipment.findFirst({
    where: { userId, shipmentMonth },
  })
  if (existing) {
    return NextResponse.json({ error: '今月の送付はすでに登録されています' }, { status: 409 })
  }

  const shipmentNumber = await generateShipmentNumber(shipmentMonth)

  const shipment = await prisma.deliveryShipment.create({
    data: {
      userId,
      shipmentNumber,
      shipmentMonth,
      description: description || null,
      imageUrls: JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      status: 'registered',
    },
  })

  return NextResponse.json(toClientShipment(shipment), { status: 201 })
}
