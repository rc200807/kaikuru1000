import { NextRequest, NextResponse , after} from 'next/server'
import { autoSyncCustomerRows } from '@/lib/sheet-sync'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendAssignmentNotification, sendStoreAssignmentNotification } from '@/lib/mailer'

// 顧客を店舗に割り当て（管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
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

  // 店舗にメール通知を送信（エラーは握りつぶして割り当て自体は成功させる）
  // ⚠️ Vercelサーバーレスでは fire-and-forget だとレスポンス返却後に関数が終了して
  // メール送信が中断されるため、必ず await する
  // 顧客タイプが「アキクル」の場合は店舗通知をスキップ
  const isAkikuru = user.customerType === 'akikuru'
  if (fullUser && user.store?.email && !isAkikuru) {
    try {
      await sendAssignmentNotification({
        storeEmail: user.store.email,
        storeName: user.store.name,
        customerName: fullUser.name,
        customerFurigana: fullUser.furigana,
        customerEmail: fullUser.email || '',
        customerPhone: fullUser.phone,
        customerAddress: fullUser.address,
        registeredAt: fullUser.createdAt,
      })
    } catch (err: any) {
      console.error('[Assignment] メール通知の送信に失敗しました:', err.message)
    }
  } else if (isAkikuru) {
    console.log(`[Assignment] アキクル顧客のため店舗通知をスキップ: userId=${userId}, storeId=${storeId}`)
  }

  // 顧客にも割り当て完了メールを送信
  if (fullUser?.email && user.store) {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
    try {
      await sendStoreAssignmentNotification({
        to: fullUser.email,
        name: fullUser.name,
        storeName: user.store.name,
        customerType: user.customerType,
        loginUrl: `${baseUrl}/login`,
      })
    } catch (err: any) {
      console.error('[Assignment] 顧客通知メールの送信に失敗しました:', err.message)
    }
  }

  after(() => autoSyncCustomerRows([userId]))

  return NextResponse.json({ userId, storeId, storeName: user.store?.name })
}

// 未割り当て顧客一覧（管理者のみ）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const unassigned = await prisma.user.findMany({
    where: { storeId: null },
    select: { id: true, name: true, furigana: true, email: true, address: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(unassigned)
}
