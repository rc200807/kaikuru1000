import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** imageUrls / trackingImageUrls をプロキシURLに変換して返す */
function toClientShipment(s: any) {
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(s.imageUrls || '[]') } catch { /* ignore */ }
  let trackingUrls: string[] = []
  try { trackingUrls = JSON.parse(s.trackingImageUrls || '[]') } catch { /* ignore */ }
  return {
    ...s,
    imageUrls: blobUrls.map((_: string, i: number) => `/api/delivery-shipments/${s.id}/images/${i}`),
    trackingImageUrls: trackingUrls.map((_: string, i: number) => `/api/delivery-shipments/${s.id}/tracking-images/${i}`),
  }
}

/** 定期宅配番号を生成: HD-YYYYMM-NNNN（ランダム4桁、重複回避） */
async function generateShipmentNumber(shipmentMonth: string): Promise<string> {
  const monthStr = shipmentMonth.replace('-', '')
  for (let i = 0; i < 20; i++) {
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    const num = `HD-${monthStr}-${rand}`
    const exists = await prisma.deliveryShipment.findFirst({
      where: { shipmentNumber: num },
      select: { id: true },
    })
    if (!exists) return num
  }
  // フォールバック: タイムスタンプベース
  const ts = String(Date.now() % 10000).padStart(4, '0')
  return `HD-${monthStr}-${ts}`
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
    return NextResponse.json({ error: '定期宅配顧客のみ送付登録できます' }, { status: 403 })
  }

  const body = await request.json()
  const { description, imageUrls, trackingImageUrls, step } = body

  // 当月を YYYY-MM 形式で取得（JST）
  const now = new Date()
  const shipmentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 既存の下書きまたは登録済みがあるか確認
  const existing = await prisma.deliveryShipment.findFirst({
    where: { userId, shipmentMonth },
  })

  // ステップ2: 既存の下書きに送付情報を追加 → registered に昇格
  if (step === 2 && existing) {
    const updated = await prisma.deliveryShipment.update({
      where: { id: existing.id },
      data: {
        trackingImageUrls: JSON.stringify(Array.isArray(trackingImageUrls) ? trackingImageUrls : []),
        status: 'registered',
      },
    })
    return NextResponse.json(toClientShipment(updated))
  }

  // ステップ1（新規）: 重複チェック（registered以降は重複不可、draftは上書き可）
  if (existing && existing.status !== 'draft') {
    return NextResponse.json({ error: '今月の送付はすでに登録されています' }, { status: 409 })
  }

  // 下書きが存在する場合は上書き
  if (existing && existing.status === 'draft') {
    const updated = await prisma.deliveryShipment.update({
      where: { id: existing.id },
      data: {
        description: description || null,
        imageUrls: JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      },
    })
    return NextResponse.json(toClientShipment(updated))
  }

  // 新規作成（draft状態）
  const shipmentNumber = await generateShipmentNumber(shipmentMonth)

  const shipment = await prisma.deliveryShipment.create({
    data: {
      userId,
      shipmentNumber,
      shipmentMonth,
      description: description || null,
      imageUrls: JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      status: 'draft',
    },
  })

  return NextResponse.json(toClientShipment(shipment), { status: 201 })
}
