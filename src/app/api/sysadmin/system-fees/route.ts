import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { jstMonthKey } from '@/lib/datetime'
import { getSystemFeeServices, computeStoreFee } from '@/lib/store-billing'

// 店舗ごとの月額システム利用料 設定一覧
// （対応サービス・自動算出額・上書き額・カード登録有無・当月課金/分配状態つき）
export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = jstMonthKey(new Date())
  const [stores, settings, services, currentPayments] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, storeStatus: true, stripeCustomerId: true, supportedServices: true },
      orderBy: { code: 'asc' },
    }),
    prisma.systemFeeSetting.findMany(),
    getSystemFeeServices(),
    prisma.storePayment.findMany({
      where: { kind: 'system_fee', billingMonth: month },
      select: { id: true, storeId: true, status: true, amount: true, failureMessage: true, paidAt: true, distributionStatus: true, distributionError: true },
    }),
  ])
  const settingByStore = new Map(settings.map(s => [s.storeId, s]))
  const paymentByStore = new Map(currentPayments.map(p => [p.storeId, p]))

  return NextResponse.json({
    month,
    services,
    stores: stores.map(s => {
      const setting = settingByStore.get(s.id)
      const payment = paymentByStore.get(s.id)
      const auto = computeStoreFee(s.supportedServices, services)
      const overrideAmount = setting?.monthlyAmount ?? 0
      return {
        storeId: s.id,
        name: s.name,
        code: s.code,
        storeStatus: s.storeStatus,
        hasCustomer: !!s.stripeCustomerId,
        services: auto.breakdown,          // 課金対象になる対応サービスの内訳
        autoAmount: auto.total,            // 自動算出額
        overrideAmount,                    // 上書き額（0 = 自動）
        effectiveAmount: overrideAmount > 0 ? overrideAmount : auto.total,
        isActive: setting?.isActive ?? false,
        note: setting?.note ?? '',
        currentPayment: payment
          ? {
              id: payment.id, status: payment.status, amount: payment.amount,
              failureMessage: payment.failureMessage, paidAt: payment.paidAt,
              distributionStatus: payment.distributionStatus, distributionError: payment.distributionError,
            }
          : null,
      }
    }),
  })
}
