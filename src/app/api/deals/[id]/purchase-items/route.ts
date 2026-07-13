import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { recomputeDealAmounts } from '@/lib/deal-amounts'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

async function resolveDeal(id: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { deal }
}

/** 案件配下の買取品目一覧 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const items = await prisma.purchaseItem.findMany({ where: { dealId: id }, orderBy: { createdAt: 'asc' } })
  const result = items.map((item) => {
    let images: string[] = []
    try { images = JSON.parse(item.imageUrls || '[]') } catch { /* ignore */ }
    return { ...item, imageUrls: images.map((_: string, idx: number) => `/api/purchase-items/${item.id}/images/${idx}`) }
  })
  return NextResponse.json(result)
}

/** 案件に買取品目を追加（案件合計を自動再計算） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json()
  const { itemName, category, imageUrls, quantity, purchasePrice, janCode, rakutenData, isAdditionalRequest, notes } = body
  if (!itemName || !category) return NextResponse.json({ error: '品名とカテゴリーは必須です' }, { status: 400 })

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseItem.create({
      data: {
        dealId: id,
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
    await recomputeDealAmounts(tx, id)
    return created
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `買取品目を登録「${item.itemName}」`, req: request })
  return NextResponse.json(item, { status: 201 })
}
