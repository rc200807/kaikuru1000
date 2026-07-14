import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { deleteFile } from '@/lib/storage'
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

// 在庫詳細
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { listings: true, sourcePurchaseItem: { select: { id: true } } },
  })
  if (!item) return NextResponse.json({ error: '在庫が見つかりません' }, { status: 404 })
  if (item.storeId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(mapInventoryItem(item))
}

// 在庫更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '在庫が見つかりません' }, { status: 404 })
  if (existing.storeId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  // title を空文字に更新するのは不可（必須）
  if (body.title !== undefined && !String(body.title).trim()) {
    return NextResponse.json({ error: '商品名は必須です' }, { status: 400 })
  }
  const data = buildInventoryWriteData(body)
  // ステータス遷移時に listedAt / soldAt を初回スタンプ
  if (data.status === 'listed' && !existing.listedAt) data.listedAt = new Date()
  if (data.status === 'sold' && !existing.soldAt) data.soldAt = new Date()

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data,
    include: { listings: LISTINGS_SELECT },
  })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, memberId: user.memberId ?? null, action: `在庫を更新「${updated.title}」`, req: request })
  return NextResponse.json(mapInventoryItem(updated))
}

// 在庫削除（買取品目と共有していない画像のみ削除。listings は CASCADE）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { sourcePurchaseItem: { select: { imageUrls: true } } },
  })
  if (!item) return NextResponse.json({ error: '在庫が見つかりません' }, { status: 404 })
  if (item.storeId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 変換元（買取品目）と共有していない画像のみ Blob から削除
  const invImages = parseUrls(item.imageUrls)
  const srcImages = parseUrls(item.sourcePurchaseItem?.imageUrls)
  const toDelete = invImages.filter((u) => !srcImages.includes(u))
  for (const url of toDelete) {
    try { await deleteFile(url) } catch { /* 削除失敗は無視 */ }
  }

  await prisma.inventoryItem.delete({ where: { id } })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, memberId: user.memberId ?? null, action: `在庫を削除「${item.title}」`, req: request })
  return NextResponse.json({ success: true })
}
