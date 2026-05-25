import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendContractEmail } from '@/lib/mailer'
import { buildContractBodyHtml, buildContractBodyText } from '@/lib/contract-email-template'

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
          id: true, name: true, address: true, phone: true,
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

  const body = await request.json()
  const { signatureData, pdfBase64, email: inputEmail } = body

  if (!signatureData) {
    return NextResponse.json({ error: '署名データが必要です' }, { status: 400 })
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

  // 既存の契約書があれば上書き、なければ新規作成
  const contract = await prisma.salesContract.upsert({
    where: { visitScheduleId: id },
    create: {
      visitScheduleId: id,
      signatureData,
      pdfBase64: pdfBase64 ?? null,
      customerEmail,
      agreedAt: new Date(),
    },
    update: {
      signatureData,
      pdfBase64: pdfBase64 ?? null,
      customerEmail,
      agreedAt: new Date(),
      emailSentAt: null, // 再送信可能にリセット
    },
  })

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
    customerPhone: schedule.user.phone,
    customerIdType: schedule.user.idDocumentType,
    storeName: schedule.store.name,
    storeAddress: schedule.store.address,
    storePhone: schedule.store.phone,
    operator: schedule.store.operator || null,
    staffName: schedule.staffName || undefined,
    visitDate: schedule.visitDate,
    contractDate: new Date(contract.agreedAt),
    contractNo: `KK-${id.slice(-8).toUpperCase()}`,
    invoiceNo: `INV-${id.slice(-8).toUpperCase()}`,
    purchaseItems: schedule.purchaseItems.map(i => ({
      itemName: i.itemName,
      category: i.category,
      quantity: i.quantity,
      price: i.purchasePrice,
    })),
    workItems: schedule.workItems.map(w => ({
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
        pdfBase64: pdfBase64 ?? '',
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

  return NextResponse.json({
    success: true,
    contractId: contract.id,
    emailSent,
    emailErrorReason,
    pdfIncluded: !!pdfBase64,
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

  const contract = await prisma.salesContract.findUnique({
    where: { visitScheduleId: id },
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
