import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendAssignmentNotification } from '@/lib/mailer'

// 顧客を店舗に割り当て（管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { userId, storeId } = body

  if (!userId || !storeId) {
    return NextResponse.json({ error: 'userId と storeId が必要です' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { storeId },
    include: {
      store: true,
    },
  })

  // 顧客の詳細情報を取得（通知メール用）
  const fullUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      furigana: true,
      email: true,
      phone: true,
      address: true,
      createdAt: true,
    },
  })

  // 店舗にメール通知を送信（非同期・エラーは握りつぶして割り当て自体は成功させる）
  if (fullUser && user.store?.email) {
    sendAssignmentNotification({
      storeEmail: user.store.email,
      storeName: user.store.name,
      customerName: fullUser.name,
      customerFurigana: fullUser.furigana,
      customerEmail: fullUser.email,
      customerPhone: fullUser.phone,
      customerAddress: fullUser.address,
      registeredAt: fullUser.createdAt,
    }).catch((err) => {
      console.error('[Assignment] メール通知の送信に失敗しました:', err.message)
    })
  }

  return NextResponse.json({ userId, storeId, storeName: user.store?.name })
}

// 未割り当て顧客一覧（管理者のみ）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const unassigned = await prisma.user.findMany({
    where: { storeId: null },
    select: { id: true, name: true, furigana: true, email: true, address: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(unassigned)
}
