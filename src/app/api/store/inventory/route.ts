import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { buildInventoryWriteData, mapInventoryItem } from '@/lib/inventory-input'

const LISTINGS_SELECT = { select: { id: true, marketplace: true, listingStatus: true, url: true } } as const

// 店舗の在庫一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const { searchParams } = new URL(request.url)
  const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '300', 10)))

  const items = await prisma.inventoryItem.findMany({
    where: { storeId },
    include: { listings: LISTINGS_SELECT },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ items: items.map(mapInventoryItem) })
}

// 在庫を手動登録（買取品目からの変換は /convert を使用）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const body = await request.json()

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  const costPrice = Number(body.costPrice)
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return NextResponse.json({ error: '仕入れ値を正しく入力してください' }, { status: 400 })
  }

  const data = buildInventoryWriteData(body)
  const item = await prisma.inventoryItem.create({
    data: { ...data, storeId, title, costPrice: Math.trunc(costPrice) },
    include: { listings: LISTINGS_SELECT },
  })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, memberId: user.memberId ?? null, action: `在庫を登録「${title}」`, req: request })
  return NextResponse.json(mapInventoryItem(item), { status: 201 })
}
