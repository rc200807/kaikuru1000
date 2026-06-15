import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEstimateEmail } from '@/lib/mailer'
import { recordAccessLog } from '@/lib/access-log'
import { DEAL_AUTO_ADVANCE_FROM } from '@/lib/deal-status'

/** 見積書を保存してメール送信 */
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

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      store: { select: { id: true, name: true, address: true, phone: true } },
      purchaseItems: { select: { purchasePrice: true, quantity: true } },
      workItems: { select: { unitPrice: true, quantity: true } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ操作可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { validUntil, staffName, pdfBase64, email: inputEmail } = body

  if (!validUntil) {
    return NextResponse.json({ error: '見積有効期限を指定してください' }, { status: 400 })
  }
  const validUntilDate = new Date(validUntil)
  if (isNaN(validUntilDate.getTime())) {
    return NextResponse.json({ error: '見積有効期限が不正です' }, { status: 400 })
  }

  // 金額はサーバー側で品目から算出（クライアントの値は信用しない）
  const purchaseAmount = schedule.purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const billingAmount = schedule.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  // フロントから受け取ったメールアドレスを優先（無ければ既存のUser.email）
  let customerEmail: string = (typeof inputEmail === 'string' ? inputEmail.trim() : '') || schedule.user.email || ''

  // 入力されたメアドが既存と異なる場合は User.email を更新（売買契約書と同じ挙動）
  if (inputEmail && typeof inputEmail === 'string' && inputEmail.trim() && inputEmail.trim() !== schedule.user.email) {
    try {
      await prisma.user.update({
        where: { id: schedule.user.id },
        data: { email: inputEmail.trim() },
      })
      customerEmail = inputEmail.trim()
    } catch (e) {
      console.error('User.email 更新失敗:', e)
    }
  }

  // 既存の見積書があれば上書き、なければ新規作成
  const estimate = await prisma.estimate.upsert({
    where: { visitScheduleId: id },
    create: {
      visitScheduleId: id,
      purchaseAmount,
      billingAmount,
      validUntil: validUntilDate,
      staffName: typeof staffName === 'string' ? staffName : '',
      customerEmail,
      pdfBase64: pdfBase64 ?? null,
    },
    update: {
      purchaseAmount,
      billingAmount,
      validUntil: validUntilDate,
      staffName: typeof staffName === 'string' ? staffName : '',
      customerEmail,
      pdfBase64: pdfBase64 ?? null,
      emailSentAt: null, // 再送信可能にリセット
    },
  })

  // 案件に紐づく訪問で見積書が発行されたら、案件ステータスを「見積のみ」へ前進（前進のみ・終端は変更しない）
  if (schedule.dealId) {
    try {
      await prisma.deal.updateMany({
        where: { id: schedule.dealId, status: { in: DEAL_AUTO_ADVANCE_FROM.estimate_only } },
        data: { status: 'estimate_only' },
      })
    } catch (e) {
      console.error('[Deal] 見積のみへの自動遷移に失敗:', e)
    }
  }

  // メール送信
  let emailSent = false
  let emailErrorReason: string | null = null
  if (!customerEmail) {
    emailErrorReason = 'no-email'
  } else {
    try {
      emailSent = await sendEstimateEmail({
        customerEmail,
        storeName: schedule.store.name,
        staffName: typeof staffName === 'string' ? staffName : '',
        purchaseAmount,
        billingAmount,
        validUntil: validUntilDate,
        pdfBase64: pdfBase64 ?? '',
      })
      if (emailSent) {
        await prisma.estimate.update({
          where: { id: estimate.id },
          data: { emailSentAt: new Date() },
        })
      } else {
        emailErrorReason = 'smtp-disabled'
      }
    } catch (e) {
      emailErrorReason = 'smtp-error'
      console.error('[estimate POST] 見積書メール送信失敗:', e)
    }
  }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: '見積書を作成', req: request })
  return NextResponse.json({
    success: true,
    estimateId: estimate.id,
    emailSent,
    emailErrorReason,
    pdfIncluded: !!pdfBase64,
  })
}

/** 見積書取得（既存チェック用） */
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

  const estimate = await prisma.estimate.findUnique({
    where: { visitScheduleId: id },
    select: {
      id: true,
      validUntil: true,
      emailSentAt: true,
      customerEmail: true,
      purchaseAmount: true,
      billingAmount: true,
      createdAt: true,
    },
  })

  return NextResponse.json(estimate ?? null)
}
