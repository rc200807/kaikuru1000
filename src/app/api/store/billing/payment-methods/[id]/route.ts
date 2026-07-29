import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

async function resolveStoreCustomer() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user.role !== 'store') return { error: 'Unauthorized', status: 401 as const }
  const store = await prisma.store.findUnique({ where: { id: user.id }, select: { id: true, name: true, stripeCustomerId: true } })
  if (!store?.stripeCustomerId) return { error: 'カードが登録されていません', status: 404 as const }
  return { user, store, customerId: store.stripeCustomerId }
}

/** カードの所有チェック（他店舗・他顧客のPMを操作させない） */
async function verifyOwnership(paymentMethodId: string, customerId: string) {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
  const owner = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
  return owner === customerId ? pm : null
}

// デフォルトカードに設定
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolveStoreCustomer()
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { id } = await params

  try {
    const pm = await verifyOwnership(id, access.customerId)
    if (!pm) return NextResponse.json({ error: 'カードが見つかりません' }, { status: 404 })
    await stripe.customers.update(access.customerId, {
      invoice_settings: { default_payment_method: id },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[store/billing/payment-methods] set default failed', e)
    return NextResponse.json({ error: 'デフォルトカードの設定に失敗しました' }, { status: 500 })
  }
}

// カード削除（デフォルト削除時は残カードへ自動付替）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolveStoreCustomer()
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { id } = await params

  try {
    const pm = await verifyOwnership(id, access.customerId)
    if (!pm) return NextResponse.json({ error: 'カードが見つかりません' }, { status: 404 })

    await stripe.paymentMethods.detach(id)

    // デフォルトだった場合は残りの先頭カードをデフォルトへ
    const customer = await stripe.customers.retrieve(access.customerId)
    if (!('deleted' in customer && customer.deleted)) {
      const def = (customer as any).invoice_settings?.default_payment_method
      if (!def) {
        const rest = await stripe.paymentMethods.list({ customer: access.customerId, type: 'card', limit: 1 })
        if (rest.data[0]) {
          await stripe.customers.update(access.customerId, {
            invoice_settings: { default_payment_method: rest.data[0].id },
          })
        }
      }
    }

    await recordAccessLog({
      userType: 'store', userId: access.store.id, userName: access.store.name,
      memberId: access.user.memberId ?? null,
      action: `支払いカードを削除（末尾${pm.card?.last4 ?? '****'}）`, req: request,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[store/billing/payment-methods] delete failed', e)
    return NextResponse.json({ error: 'カードの削除に失敗しました' }, { status: 500 })
  }
}
