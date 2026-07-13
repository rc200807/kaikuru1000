import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendContractEmail, sendContractCreatedNotification } from '@/lib/mailer'
import { buildContractBodyHtml, buildContractBodyText } from '@/lib/contract-email-template'
import { recordAccessLog } from '@/lib/access-log'
import { DEAL_AUTO_ADVANCE_FROM } from '@/lib/deal-status'

/** 売買契約書を保存してメール送信 */
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
      user: {
        select: {
          id: true, name: true, email: true, address: true, phone: true,
          idName: true, idAddress: true, idDocumentType: true,
        },
      },
      store: {
        select: {
          id: true, name: true, address: true, phone: true, email: true, contractNotifyEmail: true,
          operator: {
            select: {
              entityType: true,
              corporatePrefix: true,
              prefixPosition: true,
              name: true,
              address: true,
              representativeName: true,
            },
          },
        },
      },
      purchaseItems: { orderBy: { createdAt: 'asc' } },
      workItems: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }

  // 店舗は自店舗のスケジュールのみ操作可
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 品目・書類は「案件」を正とする（再ペアレント後）。案件配下の品目で金額・帳票を構成し、契約は案件に1通。
  const dealId = schedule.dealId
  const purchaseItems = dealId
    ? await prisma.purchaseItem.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
    : schedule.purchaseItems
  const workItems = dealId
    ? await prisma.workItem.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
    : schedule.workItems
  const docWhere = dealId ? { dealId } : { visitScheduleId: id }

  const body = await request.json()
  const { signatureData, invoiceSignatureData, pdfBase64, invoicePdfBase64, email: inputEmail, occupation, phone: inputPhone } = body

  if (!signatureData) {
    return NextResponse.json({ error: '売買契約への署名が必要です' }, { status: 400 })
  }
  // 請求項目が無い案件は請求書自体が不要 → 請求書署名も任意
  const hasInvoice = workItems.length > 0
  if (hasInvoice && !invoiceSignatureData) {
    return NextResponse.json({ error: '請求書への署名が必要です' }, { status: 400 })
  }

  // フロントから受け取ったメールアドレスを優先（無ければ既存のUser.email）
  let customerEmail: string = (typeof inputEmail === 'string' ? inputEmail.trim() : '') || schedule.user.email || ''

  // 入力されたメアドが既存と異なる場合は User.email を更新
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

  // 職業が入力されていれば顧客情報に反映（空欄なら既存値を保持）
  if (typeof occupation === 'string' && occupation.trim()) {
    try {
      await prisma.user.update({
        where: { id: schedule.user.id },
        data: { occupation: occupation.trim() },
      })
    } catch (e) {
      console.error('User.occupation 更新失敗:', e)
    }
  }

  // 電話番号が入力されていれば顧客情報に反映し、契約書にも反映（空欄なら既存値を保持）
  let effectivePhone: string = schedule.user.phone
  if (typeof inputPhone === 'string' && inputPhone.trim()) {
    effectivePhone = inputPhone.trim()
    if (inputPhone.trim() !== schedule.user.phone) {
      try {
        await prisma.user.update({
          where: { id: schedule.user.id },
          data: { phone: inputPhone.trim() },
        })
      } catch (e) {
        console.error('User.phone 更新失敗:', e)
      }
    }
  }

  // 既存の契約書PDFを取得（クライアントの再生成が失敗しても保存済みPDFを保持・添付するため）
  const prevContract = await prisma.salesContract.findUnique({
    where: docWhere,
    select: { pdfBase64: true, invoicePdfBase64: true },
  })
  // 実効PDF = 今回受領分があればそれ、無ければ保存済みを引き継ぐ（null上書きで消さない）
  const effectivePdfBase64 = (typeof pdfBase64 === 'string' && pdfBase64) ? pdfBase64 : (prevContract?.pdfBase64 ?? null)
  const effectiveInvoicePdfBase64 = (typeof invoicePdfBase64 === 'string' && invoicePdfBase64) ? invoicePdfBase64 : (prevContract?.invoicePdfBase64 ?? null)

  // 既存の契約書があれば上書き、なければ新規作成（案件に1通＝dealId基準。visitScheduleId は閲覧リンク用に保持）
  const contract = await prisma.salesContract.upsert({
    where: docWhere,
    create: {
      visitScheduleId: id,
      dealId,
      signatureData,
      invoiceSignatureData,
      pdfBase64: effectivePdfBase64,
      invoicePdfBase64: effectiveInvoicePdfBase64,
      customerEmail,
      agreedAt: new Date(),
    },
    update: {
      signatureData,
      invoiceSignatureData,
      pdfBase64: effectivePdfBase64,
      invoicePdfBase64: effectiveInvoicePdfBase64,
      customerEmail,
      agreedAt: new Date(),
      emailSentAt: null, // 再送信可能にリセット
    },
  })

  // 案件に紐づく訪問で売買契約書が発行されたら、案件ステータスを「契約」へ前進（前進のみ・終端は変更しない）
  if (schedule.dealId) {
    try {
      await prisma.deal.updateMany({
        where: { id: schedule.dealId, status: { in: DEAL_AUTO_ADVANCE_FROM.contract } },
        data: { status: 'contract' },
      })
    } catch (e) {
      console.error('[Deal] 契約への自動遷移に失敗:', e)
    }
  }

  // パスワード設定誘導用のマジックリンクを生成
  let magicLinkUrl: string | undefined
  if (customerEmail) {
    try {
      const crypto = await import('crypto')
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)
      await prisma.magicLink.create({
        data: {
          token,
          userId: schedule.user.id,
          contractId: id,
          expiresAt,
        },
      })
      const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
      magicLinkUrl = `${baseUrl}/magic/${token}?setup=1`
    } catch (e) {
      console.error('マジックリンク生成失敗:', e)
    }
  }

  // 契約書本文（HTML/Text）を組み立て: 売買契約書 + 請求書 + 特商法書面 + 同意の記録
  const contractTemplateParams = {
    customerName: schedule.user.idName || schedule.user.name,
    customerAddress: schedule.user.idAddress || schedule.user.address || '',
    customerPhone: effectivePhone,
    customerIdType: schedule.user.idDocumentType,
    storeName: schedule.store.name,
    storeAddress: schedule.store.address,
    storePhone: schedule.store.phone,
    operator: schedule.store.operator || null,
    staffName: schedule.staffName || undefined,
    visitDate: schedule.visitDate,
    revisitDate: schedule.revisitDate || null,
    revisitStart: schedule.revisitStart || null,
    revisitEnd: schedule.revisitEnd || null,
    revisitNote: schedule.revisitNote || null,
    contractDate: new Date(contract.agreedAt),
    contractNo: `KK-${id.slice(-8).toUpperCase()}`,
    invoiceNo: `INV-${id.slice(-8).toUpperCase()}`,
    purchaseItems: purchaseItems.map(i => ({
      itemName: i.itemName,
      category: i.category,
      quantity: i.quantity,
      price: i.purchasePrice,
    })),
    workItems: workItems.map(w => ({
      workName: w.workName,
      quantity: w.quantity,
      unitPrice: w.unitPrice,
    })),
    agreedAt: new Date(contract.agreedAt),
  }
  const contractBodyHtml = buildContractBodyHtml(contractTemplateParams)
  const contractBodyText = buildContractBodyText(contractTemplateParams)

  // メール送信（PDFは任意。PDFが無くてもマジックリンクと本文だけは送る）
  let emailSent = false
  let emailErrorReason: string | null = null
  if (!customerEmail) {
    emailErrorReason = 'no-email'
    console.warn('[contract POST] メール送信スキップ: customerEmail が空です')
  } else {
    try {
      emailSent = await sendContractEmail({
        customerEmail,
        customerName: schedule.user.idName || schedule.user.name,
        storeName: schedule.store.name,
        visitDate: schedule.visitDate,
        pdfBase64: effectivePdfBase64 ?? '',
        invoicePdfBase64: effectiveInvoicePdfBase64 ?? '',
        magicLinkUrl,
        contractBodyHtml,
        contractBodyText,
      })
      if (emailSent) {
        await prisma.salesContract.update({
          where: { id: contract.id },
          data: { emailSentAt: new Date() },
        })
      } else {
        emailErrorReason = 'smtp-disabled'
        console.warn('[contract POST] メール送信失敗: SMTP未構成またはトランスポーターnull')
      }
    } catch (e) {
      emailErrorReason = 'smtp-error'
      console.error('[contract POST] 契約書メール送信失敗:', e)
    }
  }

  // 店舗への契約作成通知（contractNotifyEmail 優先・未設定なら店舗メール）。失敗しても本処理は成功扱い。
  try {
    const notifyTo = schedule.store.contractNotifyEmail || schedule.store.email
    if (notifyTo) {
      const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
      const purchaseTotal = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
      const billingTotal = workItems.reduce((s, w) => s + w.unitPrice * w.quantity, 0)
      await sendContractCreatedNotification({
        to: notifyTo,
        storeName: schedule.store.name,
        customerName: schedule.user.idName || schedule.user.name,
        customerPhone: effectivePhone,
        visitDate: schedule.visitDate,
        purchaseAmount: purchaseTotal,
        billingAmount: billingTotal,
        contractUrl: `${baseUrl}/store/schedule/${id}`,
      })
    }
  } catch (e) {
    console.error('[contract POST] 店舗通知メール送信失敗:', e)
  }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: '売買契約書を作成', req: request })
  return NextResponse.json({
    success: true,
    contractId: contract.id,
    emailSent,
    emailErrorReason,
    pdfIncluded: !!effectivePdfBase64,
    magicLinkUrl,
  })
}

/** 契約書取得（既存チェック用） */
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

  // 契約は案件に1通。該当訪問の案件IDで照会し、無ければ従来の訪問基準。
  const sched = await prisma.visitSchedule.findUnique({ where: { id }, select: { dealId: true } })
  const contract = await prisma.salesContract.findUnique({
    where: sched?.dealId ? { dealId: sched.dealId } : { visitScheduleId: id },
    select: {
      id: true,
      agreedAt: true,
      emailSentAt: true,
      customerEmail: true,
      createdAt: true,
    },
  })

  return NextResponse.json(contract ?? null)
}
