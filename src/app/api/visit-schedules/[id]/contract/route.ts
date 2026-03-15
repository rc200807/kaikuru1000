import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendContractEmail } from '@/lib/mailer'

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
      user: { select: { id: true, name: true, email: true, address: true, phone: true } },
      store: { select: { id: true, name: true } },
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
  const { signatureData, pdfBase64 } = body

  if (!signatureData) {
    return NextResponse.json({ error: '署名データが必要です' }, { status: 400 })
  }

  const customerEmail = schedule.user.email

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

  // メール送信（顧客にPDF添付）
  let emailSent = false
  if (customerEmail && pdfBase64) {
    try {
      emailSent = await sendContractEmail({
        customerEmail,
        customerName: schedule.user.name,
        storeName: schedule.store.name,
        visitDate: schedule.visitDate,
        pdfBase64,
      })
      if (emailSent) {
        await prisma.salesContract.update({
          where: { id: contract.id },
          data: { emailSentAt: new Date() },
        })
      }
    } catch (e) {
      console.error('契約書メール送信失敗:', e)
    }
  }

  return NextResponse.json({ success: true, contractId: contract.id, emailSent })
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
