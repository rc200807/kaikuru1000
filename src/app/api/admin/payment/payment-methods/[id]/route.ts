import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// 保存済みカードを削除（detach）
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const account = await prisma.supplyBillingAccount.findUnique({ where: { id: 'default' } })
  if (!account?.stripeCustomerId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    // 念のため対象カードが本部顧客のものか確認
    const pm = await stripe.paymentMethods.retrieve(id)
    if (pm.customer !== account.stripeCustomerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await stripe.paymentMethods.detach(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[payment-methods] detach failed', e)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
