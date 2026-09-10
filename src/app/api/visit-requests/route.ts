import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueEmail } from '@/lib/email-queue'
import { intervalNoticeText, visitRequestAvailability } from '@/lib/request-interval'
import { resolveStoreScope } from '@/lib/store-scope'
import type { VisitRequestCandidate } from '@/lib/mailer'

// 訪問リクエスト一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const requestedBy = searchParams.get('requestedBy')

  const where: any = {}
  if (sessionUser.role === 'customer') where.userId = sessionUser.id
  if (sessionUser.role === 'store') {
    // 表示スコープ（運営者配下の複数店舗）に対応。承認・逆提案は自店舗のみで、
    // それは api/visit-requests/[id] のサーバー側ガードとUI側の両方で担保している
    const scope = await resolveStoreScope(sessionUser.id, searchParams.get('storeIds'))
    where.storeId = scope.isMulti ? { in: scope.storeIds } : sessionUser.id
    const userId = searchParams.get('userId')
    if (userId) where.userId = userId
  }
  if (status) {
    const statuses = status.split(',').map(s => s.trim())
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses }
  }
  if (requestedBy) where.requestedBy = requestedBy

  const requests = await prisma.visitRequest.findMany({
    where,
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 顧客には「次回いつからリクエストできるか」も返す（マイページの案内に使う）
  const availability = sessionUser.role === 'customer'
    ? await visitRequestAvailability(sessionUser.id)
    : null

  return NextResponse.json({ requests, ...(availability ? { availability } : {}) })
}

/** 通知メールに載せる候補日時（第1〜第3希望） */
function candidatesOf(r: {
  candidate1Date: Date; candidate1Start: string | null; candidate1End: string | null
  candidate2Date: Date; candidate2Start: string | null; candidate2End: string | null
  candidate3Date: Date; candidate3Start: string | null; candidate3End: string | null
}): VisitRequestCandidate[] {
  return [
    { date: r.candidate1Date, start: r.candidate1Start, end: r.candidate1End },
    { date: r.candidate2Date, start: r.candidate2Start, end: r.candidate2End },
    { date: r.candidate3Date, start: r.candidate3Start, end: r.candidate3End },
  ]
}

// 訪問リクエスト作成（顧客 or 店舗）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  const body = await request.json()
  const {
    candidate1Date, candidate1Start, candidate1End,
    candidate2Date, candidate2Start, candidate2End,
    candidate3Date, candidate3Start, candidate3End,
    customerNote, storeNote,
  } = body

  // 店舗からの訪問提案
  if (sessionUser.role === 'store') {
    const { userId } = body
    if (!userId) {
      return NextResponse.json({ error: '顧客IDが指定されていません' }, { status: 400 })
    }

    const visitRequest = await prisma.visitRequest.create({
      data: {
        userId,
        storeId: sessionUser.id,
        requestedBy: 'store',
        candidate1Date: new Date(candidate1Date),
        candidate1Start: candidate1Start || null,
        candidate1End: candidate1End || null,
        candidate2Date: new Date(candidate2Date),
        candidate2Start: candidate2Start || null,
        candidate2End: candidate2End || null,
        candidate3Date: new Date(candidate3Date),
        candidate3Start: candidate3Start || null,
        candidate3End: candidate3End || null,
        storeNote: storeNote || null,
        status: 'pending',
      },
      include: {
        user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
        store: { select: { name: true } },
      },
    })

    return NextResponse.json(visitRequest, { status: 201 })
  }

  // 顧客からの訪問リクエスト
  if (sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 顧客の担当店舗を取得
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { storeId: true },
  })

  if (!user?.storeId) {
    return NextResponse.json({ error: '店舗が割り当てられていません' }, { status: 400 })
  }

  // 利用間隔の制限（既定は月1回。顧客ごと・管理ポータルで変更できる）
  const availability = await visitRequestAvailability(sessionUser.id)
  if (!availability.available) {
    return NextResponse.json({
      error: `訪問リクエストは${availability.intervalMonths}ヶ月に1回までご利用いただけます。${intervalNoticeText(availability)}`,
      availability,
    }, { status: 429 })
  }

  const visitRequest = await prisma.visitRequest.create({
    data: {
      userId: sessionUser.id,
      storeId: user.storeId,
      requestedBy: 'customer',
      candidate1Date: new Date(candidate1Date),
      candidate1Start: candidate1Start || null,
      candidate1End: candidate1End || null,
      candidate2Date: new Date(candidate2Date),
      candidate2Start: candidate2Start || null,
      candidate2End: candidate2End || null,
      candidate3Date: new Date(candidate3Date),
      candidate3Start: candidate3Start || null,
      candidate3End: candidate3End || null,
      customerNote: customerNote || null,
      status: 'pending',
    },
    include: {
      user: { select: { name: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { name: true, email: true, contractNotifyEmail: true } },
    },
  })

  // 顧客・店舗への受付通知（キュー経由。失敗してもリクエスト登録は成功扱い）
  await notifyVisitRequestReceived(visitRequest)

  // 次回リクエスト可能日を返し、マイページで案内できるようにする
  const nextAvailability = await visitRequestAvailability(sessionUser.id)
  return NextResponse.json({ ...visitRequest, availability: nextAvailability }, { status: 201 })
}

/** 訪問リクエスト受付を顧客と店舗に通知する（送信はキュー経由・失敗しても本処理は成功扱い） */
async function notifyVisitRequestReceived(r: {
  id: string
  userId: string
  user: { name: string; email: string | null; phone: string; address: string }
  store: { name: string; email: string | null; contractNotifyEmail: string | null }
  candidate1Date: Date; candidate1Start: string | null; candidate1End: string | null
  candidate2Date: Date; candidate2Start: string | null; candidate2End: string | null
  candidate3Date: Date; candidate3Start: string | null; candidate3End: string | null
  customerNote: string | null
}) {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const candidates = candidatesOf(r)
  try {
    if (r.user.email) {
      const availability = await visitRequestAvailability(r.userId)
      await enqueueEmail({
        type: 'visitRequestReceivedCustomer',
        params: {
          customerEmail: r.user.email,
          customerName: r.user.name,
          storeName: r.store.name,
          candidates,
          customerNote: r.customerNote,
          nextAvailableNotice: intervalNoticeText(availability),
          mypageUrl: `${baseUrl}/mypage?tab=visit-request`,
        },
      })
    }
  } catch (e) {
    console.error('[visit-requests] 顧客への受付通知メールのキュー登録に失敗:', e)
  }
  try {
    const notifyTo = r.store.contractNotifyEmail || r.store.email
    if (notifyTo) {
      await enqueueEmail({
        type: 'visitRequestReceivedStore',
        params: {
          to: notifyTo,
          storeName: r.store.name,
          customerName: r.user.name,
          customerPhone: r.user.phone,
          customerAddress: r.user.address,
          candidates,
          customerNote: r.customerNote,
          requestUrl: `${baseUrl}/store/schedule`,
        },
      })
    }
  } catch (e) {
    console.error('[visit-requests] 店舗への受付通知メールのキュー登録に失敗:', e)
  }
}
