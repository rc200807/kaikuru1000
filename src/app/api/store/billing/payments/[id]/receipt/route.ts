import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { allocateReceiptNumber } from '@/lib/store-billing'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

/**
 * 領収書の発行（宛名保存＋初回のみ採番）。
 * 番号は初回発行時に確定し以後不変。宛名は何度でも変更できる。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const receiptName = typeof body.receiptName === 'string' ? body.receiptName.trim() : ''
  if (!receiptName) return NextResponse.json({ error: '宛名を入力してください' }, { status: 400 })
  if (receiptName.length > 100) return NextResponse.json({ error: '宛名は100文字以内で入力してください' }, { status: 400 })

  const payment = await prisma.storePayment.findUnique({
    where: { id },
    select: { id: true, storeId: true, status: true, receiptNumber: true },
  })
  if (!payment || payment.storeId !== user.id) return NextResponse.json({ error: '支払いが見つかりません' }, { status: 404 })
  if (payment.status !== 'paid') return NextResponse.json({ error: '支払い完了後に発行できます' }, { status: 400 })

  const receiptNumber = payment.receiptNumber ?? await allocateReceiptNumber()
  const updated = await prisma.storePayment.update({
    where: { id: payment.id },
    data: {
      receiptName,
      receiptNumber,
      ...(payment.receiptNumber ? {} : { receiptIssuedAt: new Date() }),
    },
    select: {
      id: true, description: true, amount: true, paidAt: true,
      receiptNumber: true, receiptName: true, receiptIssuedAt: true,
    },
  })

  await recordAccessLog({
    userType: 'store', userId: user.id, userName: user.name ?? null,
    memberId: user.memberId ?? null,
    action: `領収書を発行（${updated.receiptNumber}・宛名: ${receiptName}）`, req: request,
  })
  return NextResponse.json(updated)
}
