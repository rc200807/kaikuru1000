import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { recomputeDealAmounts } from '@/lib/deal-amounts'

/** 買取品目一覧取得 */
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

  const items = await prisma.purchaseItem.findMany({
    where: { visitScheduleId: id },
    orderBy: { createdAt: 'asc' },
  })

  // imageUrls をプロキシURLに変換
  const result = items.map((item) => {
    let images: string[] = []
    try { images = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }
    return {
      ...item,
      imageUrls: images.map((_: string, idx: number) =>
        `/api/purchase-items/${item.id}/images/${idx}`
      ),
    }
  })

  return NextResponse.json(result)
}

/** 買取品目を追加（purchaseAmount自動再計算） */
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

  const { itemName, category, imageUrls, quantity, purchasePrice, janCode, rakutenData, isAdditionalRequest, notes } = body

  if (!itemName || !category) {
    return NextResponse.json({ error: '品名とカテゴリーは必須です' }, { status: 400 })
  }

  // トランザクションで品目追加 + 合計再計算
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseItem.create({
      data: {
        visitScheduleId: id,
        dealId: schedule.dealId,  // 案件にも紐づける（再ペアレント後の正・両系統を同期）
        itemName,
        category,
        imageUrls: JSON.stringify(imageUrls || []),
        quantity: quantity ?? 1,
        purchasePrice: purchasePrice ?? 0,
        janCode: janCode || null,
        rakutenData: rakutenData ? JSON.stringify(rakutenData) : null,
        isAdditionalRequest: isAdditionalRequest ?? false,
        notes: notes || null,
      },
    })

    // purchaseAmount 再計算（訪問＝後方互換／案件＝正）
    const allItems = await tx.purchaseItem.findMany({ where: { visitScheduleId: id } })
    const total = allItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0)
    await tx.visitSchedule.update({ where: { id }, data: { purchaseAmount: total } })
    if (schedule.dealId) await recomputeDealAmounts(tx, schedule.dealId)

    return created
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `買取品目を登録「${item.itemName}」`, req: request })
  return NextResponse.json(item, { status: 201 })
}
