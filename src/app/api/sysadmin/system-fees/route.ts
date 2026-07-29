import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { jstMonthKey } from '@/lib/datetime'

// 店舗ごとの月額システム利用料 設定一覧（カード登録有無・当月課金状態つき）
export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = jstMonthKey(new Date())
  const [stores, settings, currentPayments] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, storeStatus: true, stripeCustomerId: true },
      orderBy: { code: 'asc' },
    }),
    prisma.systemFeeSetting.findMany(),
    prisma.storePayment.findMany({
      where: { kind: 'system_fee', billingMonth: month },
      select: { storeId: true, status: true, amount: true, failureMessage: true, paidAt: true },
    }),
  ])
  const settingByStore = new Map(settings.map(s => [s.storeId, s]))
  const paymentByStore = new Map(currentPayments.map(p => [p.storeId, p]))

  return NextResponse.json({
    month,
    stores: stores.map(s => {
      const setting = settingByStore.get(s.id)
      const payment = paymentByStore.get(s.id)
      return {
        storeId: s.id,
        name: s.name,
        code: s.code,
        storeStatus: s.storeStatus,
        hasCustomer: !!s.stripeCustomerId,
        monthlyAmount: setting?.monthlyAmount ?? 0,
        isActive: setting?.isActive ?? false,
        note: setting?.note ?? '',
        currentPayment: payment
          ? { status: payment.status, amount: payment.amount, failureMessage: payment.failureMessage, paidAt: payment.paidAt }
          : null,
      }
    }),
  })
}
