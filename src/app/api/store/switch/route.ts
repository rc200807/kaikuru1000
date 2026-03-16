import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST - 別の店舗アカウントに切り替え
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id

  const body = await request.json()
  const { targetStoreId } = body

  if (!targetStoreId) {
    return NextResponse.json({ error: 'targetStoreId が必要です' }, { status: 400 })
  }

  // リンクが存在するか確認
  const link = await prisma.storeLink.findFirst({
    where: {
      OR: [
        { storeId, linkedStoreId: targetStoreId },
        { storeId: targetStoreId, linkedStoreId: storeId },
      ],
    },
  })

  if (!link) {
    return NextResponse.json({ error: 'リンクされていない店舗には切り替えできません' }, { status: 403 })
  }

  // 切り替え先の店舗情報を取得
  const targetStore = await prisma.store.findUnique({
    where: { id: targetStoreId },
    select: { id: true, name: true, email: true, avatar: true },
  })

  if (!targetStore) {
    return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  }

  return NextResponse.json({
    id: targetStore.id,
    name: targetStore.name,
    email: targetStore.email,
    avatar: targetStore.avatar,
  })
}
