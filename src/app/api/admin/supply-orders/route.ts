import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { getOrCreateBillingCustomer } from '@/lib/billing'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const createSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable().optional(),
    quantity: z.number().int().min(1).max(9999),
  })).min(1),
  note: z.string().max(2000).nullable().optional(),
})

// 発注履歴一覧（管理ポータル）
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orders = await prisma.supplyOrder.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(orders)
}

// 発注を作成し、PaymentIntent + CustomerSession を返す
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  // サーバー側で現在価格を再取得して合計を計算（クライアント値は信用しない）
  const productIds = [...new Set(parsed.data.items.map(i => i.productId))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true },
  })
  const productMap = new Map(products.map(p => [p.id, p]))

  const lineItems: {
    productId: string
    variantId: string | null
    productName: string
    sizeName: string | null
    unitPrice: number
    quantity: number
    subtotal: number
  }[] = []

  for (const item of parsed.data.items) {
    const product = productMap.get(item.productId)
    if (!product) {
      return NextResponse.json({ error: `商品が見つかりません: ${item.productId}` }, { status: 400 })
    }
    // 最低ロット（最低発注数）チェック
    if (product.minLot > 1 && item.quantity < product.minLot) {
      return NextResponse.json({ error: `「${product.name}」は最低ロット ${product.minLot} 個からの発注です` }, { status: 400 })
    }
    // 管理ポータルの発注はサイズ問わず「仕入れ価格」で算出する
    const unitPrice = product.purchasePrice
    let sizeName: string | null = null
    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId)
      if (!variant) {
        return NextResponse.json({ error: `サイズが見つかりません: ${item.variantId}` }, { status: 400 })
      }
      sizeName = variant.sizeName
    }
    const subtotal = unitPrice * item.quantity
    lineItems.push({
      productId: product.id,
      variantId: item.variantId ?? null,
      productName: product.name,
      sizeName,
      unitPrice,
      quantity: item.quantity,
      subtotal,
    })
  }

  const totalAmount = lineItems.reduce((s, li) => s + li.subtotal, 0)
  if (totalAmount <= 0) {
    return NextResponse.json({ error: '合計金額が0円です。仕入れ価格が設定されているか確認してください' }, { status: 400 })
  }

  // 発注番号 SO-YYYYMM-NNNN
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthCount = await prisma.supplyOrder.count({ where: { orderNumber: { startsWith: `SO-${ym}-` } } })
  const orderNumber = `SO-${ym}-${String(monthCount + 1).padStart(4, '0')}`

  // 注文を作成（決済前 = pending）
  const order = await prisma.supplyOrder.create({
    data: {
      orderNumber,
      placedByAdminId: user.id,
      placedByName: user.name ?? user.email,
      totalAmount,
      status: 'pending',
      paymentStatus: 'pending',
      note: parsed.data.note ?? null,
      items: { create: lineItems },
    },
    include: { items: true },
  })

  // Stripe: 顧客・PaymentIntent・CustomerSession
  let clientSecret: string | null = null
  let customerSessionClientSecret: string | null = null
  try {
    const customerId = await getOrCreateBillingCustomer()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount, // JPY はゼロ十進通貨なので円そのまま
      currency: 'jpy',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { supplyOrderId: order.id, orderNumber },
    })

    const customerSession = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_save: 'enabled',
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    })

    clientSecret = paymentIntent.client_secret
    customerSessionClientSecret = customerSession.client_secret

    await prisma.supplyOrder.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    })
  } catch (e: any) {
    console.error('[supply-orders] stripe error', e)
    // 決済準備に失敗した注文は残さない
    await prisma.supplyOrder.delete({ where: { id: order.id } }).catch(() => {})
    return NextResponse.json({ error: '決済の準備に失敗しました。Stripe の設定を確認してください' }, { status: 500 })
  }

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name ?? user.email, action: `備品発注 ${orderNumber}（¥${totalAmount.toLocaleString()}）`, req })

  return NextResponse.json({
    orderId: order.id,
    orderNumber,
    totalAmount,
    clientSecret,
    customerSessionClientSecret,
  }, { status: 201 })
}
