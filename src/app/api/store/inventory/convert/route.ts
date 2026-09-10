import { NextRequest, NextResponse } from 'next/server'
import { PURCHASE_ITEM_OWNER_SELECT, storeOwnsPurchaseItem } from '@/lib/purchase-item-access'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { buildInventoryWriteData, mapInventoryItem } from '@/lib/inventory-input'

const LISTINGS_SELECT = { select: { id: true, marketplace: true, listingStatus: true, url: true } } as const

function parseUrls(json: string | null | undefined): string[] {
  try {
    const a = JSON.parse(json || '[]')
    return Array.isArray(a) ? a.filter((u: any) => typeof u === 'string') : []
  } catch {
    return []
  }
}

// 買取品目（PurchaseItem）を在庫（InventoryItem）に変換
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const storeId = user.id as string

  const body = await request.json()
  const purchaseItemId = body.purchaseItemId
  if (!purchaseItemId || typeof purchaseItemId !== 'string') {
    return NextResponse.json({ error: '買取品目が指定されていません' }, { status: 400 })
  }

  // 変換元の買取品目を取得。所有権は案件・訪問の両方から見る。
  // visitSchedule だけを見ると、案件直下に登録された品目（visitScheduleId=null）は
  // 自店舗のものでも必ず 403 になり、在庫化できなくなる（purchase-item-access.ts 参照）
  const src = await prisma.purchaseItem.findUnique({
    where: { id: purchaseItemId },
    include: {
      ...PURCHASE_ITEM_OWNER_SELECT,
      inventoryItem: { select: { id: true } },
    },
  })
  if (!src) return NextResponse.json({ error: '買取品目が見つかりません' }, { status: 404 })
  // 在庫はログイン中の店舗に作られるので、他店舗の品目は在庫化させない
  if (!storeOwnsPurchaseItem(src, storeId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (src.inventoryItem) {
    return NextResponse.json(
      { error: 'この買取品目はすでに在庫化されています', inventoryItemId: src.inventoryItem.id },
      { status: 409 },
    )
  }

  // 買取品目の値で初期化し、overrides（フォーム編集値）を上書き
  const base = {
    title: src.itemName,
    categoryName: src.category || '',
    costPrice: src.purchasePrice ?? 0,
    quantity: src.quantity ?? 1,
    janCode: src.janCode ?? null,
    imageUrls: parseUrls(src.imageUrls), // 元のBlob URLをそのまま再利用
  }
  const merged = { ...base, ...(body.overrides ?? {}) }

  const title = String(merged.title ?? '').trim()
  if (!title) return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  const costPrice = Number(merged.costPrice)
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return NextResponse.json({ error: '仕入れ値を正しく入力してください' }, { status: 400 })
  }

  const data = buildInventoryWriteData(merged)

  try {
    const item = await prisma.inventoryItem.create({
      data: { ...data, storeId, title, costPrice: Math.trunc(costPrice), sourcePurchaseItemId: purchaseItemId },
      include: { listings: LISTINGS_SELECT },
    })
    await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, memberId: user.memberId ?? null, action: `買取品目を在庫化「${title}」`, req: request })
    return NextResponse.json(mapInventoryItem(item), { status: 201 })
  } catch (e: any) {
    // sourcePurchaseItemId は @unique。競合は二重変換として 409
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'この買取品目はすでに在庫化されています' }, { status: 409 })
    }
    throw e
  }
}
