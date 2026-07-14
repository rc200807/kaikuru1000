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
      purchaseItems: { select: { itemName: true, category: true, purchasePrice: true, quantity: true }, orderBy: { createdAt: 'asc' } },
      workItems: { select: { workName: true, unitPrice: true, quantity: true }, orderBy: { createdAt: 'asc' } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ操作可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 品目・書類は「案件」を正とする（再ペアレント後）。見積は案件に1通。
  const dealId = schedule.dealId
  const purchaseItems = dealId
    ? await prisma.purchaseItem.findMany({ where: { dealId }, select: { itemName: true, category: true, purchasePrice: true, quantity: true }, orderBy: { createdAt: 'asc' } })
    : schedule.purchaseItems
  const workItems = dealId
    ? await prisma.workItem.findMany({ where: { dealId }, select: { workName: true, unitPrice: true, quantity: true }, orderBy: { createdAt: 'asc' } })
    : schedule.workItems
  const docWhere = dealId ? { dealId } : { visitScheduleId: id }

  const body = await request.json()
  const { validUntil, staffName, pdfBase64, invoicePdfBase64, email: inputEmail } = body

  if (!validUntil) {
    return NextResponse.json({ error: '見積有効期限を指定してください' }, { status: 400 })
  }
  const validUntilDate = new Date(validUntil)
  if (isNaN(validUntilDate.getTime())) {
    return NextResponse.json({ error: '見積有効期限が不正です' }, { status: 400 })
  }

  // 金額はサーバー側で品目から算出（クライアントの値は信用しない）。買取は上乗せ率を反映。
  const purchaseBase = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const upliftPct = dealId ? (await prisma.deal.findUnique({ where: { id: dealId }, select: { purchaseUpliftPercent: true } }))?.purchaseUpliftPercent ?? 0 : 0
  const purchaseAmount = purchaseBase + Math.round(purchaseBase * upliftPct / 100)
  const billingAmount = workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

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

  // 既存の見積書PDFを取得（クライアントの再生成が失敗しても保存済みPDFを保持・添付するため）
  const prevEstimate = await prisma.estimate.findUnique({
    where: docWhere,
    select: { pdfBase64: true, invoicePdfBase64: true },
  })
  // 実効PDF = 今回受領分があればそれ、無ければ保存済みを引き継ぐ（null上書きで消さない）
  const effectivePdfBase64 = (typeof pdfBase64 === 'string' && pdfBase64) ? pdfBase64 : (prevEstimate?.pdfBase64 ?? null)
  const effectiveInvoicePdfBase64 = (typeof invoicePdfBase64 === 'string' && invoicePdfBase64) ? invoicePdfBase64 : (prevEstimate?.invoicePdfBase64 ?? null)

  // 既存の見積書があれば上書き、なければ新規作成（案件に1通＝dealId基準。visitScheduleId は閲覧リンク用に保持）
  const estimate = await prisma.estimate.upsert({
    where: docWhere,
    create: {
      visitScheduleId: id,
      dealId,
      purchaseAmount,
      billingAmount,
      validUntil: validUntilDate,
      staffName: typeof staffName === 'string' ? staffName : '',
      customerEmail,
      pdfBase64: effectivePdfBase64,
      invoicePdfBase64: effectiveInvoicePdfBase64,
    },
    update: {
      purchaseAmount,
      billingAmount,
      validUntil: validUntilDate,
      staffName: typeof staffName === 'string' ? staffName : '',
      customerEmail,
      pdfBase64: effectivePdfBase64,
      invoicePdfBase64: effectiveInvoicePdfBase64,
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

  // 見積書をオンライン閲覧・PDFダウンロードできるマジックリンクを生成
  // （メールにPDFが添付できなかった場合でも、お客様がリンクからPDFを取得できるようにする）
  let viewUrl: string | undefined
  if (customerEmail) {
    try {
      const crypto = await import('crypto')
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)
      await prisma.magicLink.create({
        data: { token, userId: schedule.user.id, contractId: id, expiresAt },
      })
      const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
      viewUrl = `${baseUrl}/magic/${token}?doc=estimate`
    } catch (e) {
      console.error('[estimate POST] 見積マジックリンク生成失敗:', e)
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
        pdfBase64: effectivePdfBase64 ?? '',
        invoicePdfBase64: effectiveInvoicePdfBase64 ?? '',
        viewUrl,
        purchaseItems: purchaseItems.map(i => ({ name: i.itemName || '（品名未設定）', quantity: i.quantity, price: i.purchasePrice })),
        workItems: workItems.map(i => ({ name: i.workName || '（項目未設定）', quantity: i.quantity, price: i.unitPrice })),
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
    pdfIncluded: !!effectivePdfBase64,
    invoicePdfIncluded: !!effectiveInvoicePdfBase64,
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

  // 見積は案件に1通。該当訪問の案件IDで照会し、無ければ従来の訪問基準。
  const sched = await prisma.visitSchedule.findUnique({ where: { id }, select: { dealId: true } })
  const estimate = await prisma.estimate.findUnique({
    where: sched?.dealId ? { dealId: sched.dealId } : { visitScheduleId: id },
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
