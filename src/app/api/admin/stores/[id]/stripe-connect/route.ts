import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { getOrCreateConnectAccount, createOnboardingLink } from '@/lib/stripe-connect'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 店舗の Stripe Connect 状態を取得 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const store = await prisma.store.findUnique({
    where: { id },
    select: {
      id: true, name: true,
      stripeConnectAccountId: true, stripeConnectStatus: true,
      stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true,
      stripeConnectOnboardedAt: true,
    },
  })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  return NextResponse.json(store)
}

/**
 * Connect Express アカウントを作成（なければ）し、オンボーディングリンクを発行する。
 * リンクは短命・使い捨てのため毎回再発行する。管理者がコピーして店舗に案内する運用。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const store = await prisma.store.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  try {
    const accountId = await getOrCreateConnectAccount(id)
    const url = await createOnboardingLink(accountId, id)
    await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `Stripe Connectオンボーディングリンクを発行「${store.name}」`, req: request })
    return NextResponse.json({ accountId, onboardingUrl: url })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe Connectアカウントの作成に失敗しました'
    console.error('[stripe-connect] 作成失敗:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
