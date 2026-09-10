import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'

/**
 * GET: 店舗の問い合わせ一覧（storeCode付き）。
 *
 * 一覧は運営者配下の複数店舗を表示中ならその全店舗ぶんを返す（表示のみ）。
 * 一方 storeCode / inquirySheetUrl は「この店舗の問い合わせ受付URL・QR」なので、
 * 表示スコープに関わらず**必ずログイン中の店舗のもの**を返すこと。
 * ここを取り違えると、お客様を別店舗の受付フォームへ案内する事故になる。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sessionStoreId = user.id as string
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const scope = await resolveStoreScope(sessionStoreId, searchParams.get('storeIds'))

  const where: any = { storeId: scope.isMulti ? { in: scope.storeIds } : sessionStoreId }
  if (status && status !== 'all') {
    where.status = status
  }

  const [inquiries, store] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, customerType: true },
        },
        store: { select: { id: true, name: true, code: true } },
        purchaseMemos: {
          select: { id: true, title: true, imageUrls: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // 受付URL・QRはスコープ化しない（必ずログイン中の店舗のもの）
    prisma.store.findUnique({
      where: { id: sessionStoreId },
      select: { code: true, inquirySheetUrl: true, inquirySheetIssuedAt: true },
    }),
  ])

  return NextResponse.json({
    inquiries,
    storeCode: store?.code ?? '',
    inquirySheetUrl: store?.inquirySheetUrl ?? null,
    inquirySheetIssuedAt: store?.inquirySheetIssuedAt ?? null,
  })
}

// PATCH: 問い合わせのステータス更新
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const body = await request.json()
  const { inquiryId, status } = body

  if (!inquiryId || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const validStatuses = ['new', 'contacted', 'completed']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, storeId },
  })
  if (!inquiry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { status },
  })

  return NextResponse.json(updated)
}
