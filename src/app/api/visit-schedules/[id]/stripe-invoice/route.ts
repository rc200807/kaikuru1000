import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { issueAkikuruInvoice, findAkikuruBilling } from '@/lib/akikuru-invoice'

// アキクル案件のStripe請求書（契約締結フローから呼ばれる）。
// POST: 発行（冪等。open&金額一致/paidは再利用、open&金額不一致はvoid→再発行）
// GET:  既発行分の取得（契約画面の再表示・PDF再生成用）

async function resolveSchedule(id: string, sessionUser: any) {
  const schedule = await prisma.visitSchedule.findUnique({
    where: { id },
    select: {
      id: true, storeId: true, dealId: true, userId: true,
      deal: { select: { id: true, category: true, storeId: true, userId: true } },
    },
  })
  if (!schedule) return { error: 'スケジュールが見つかりません', status: 404 as const }
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return { error: 'Forbidden', status: 403 as const }
  }
  if (!schedule.deal) return { error: '案件が紐づいていません', status: 400 as const }
  if (schedule.deal.category !== 'akikuru') {
    return { error: 'アキクル案件のみStripe請求書を発行できます', status: 400 as const }
  }
  return { schedule, deal: schedule.deal }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const resolved = await resolveSchedule(id, sessionUser)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const billing = await findAkikuruBilling(resolved.deal.id)
  return NextResponse.json({ billing })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const resolved = await resolveSchedule(id, sessionUser)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const { deal } = resolved

  // 請求項目は案件配下を正とする（contract route と同じ）
  const workItems = await prisma.workItem.findMany({
    where: { dealId: deal.id },
    orderBy: { createdAt: 'asc' },
    select: { workName: true, unitPrice: true, quantity: true },
  })
  if (workItems.length === 0) {
    return NextResponse.json({ error: '請求項目がありません' }, { status: 400 })
  }

  try {
    const billing = await issueAkikuruInvoice({
      dealId: deal.id,
      storeId: deal.storeId,
      userId: deal.userId,
      items: workItems.map(w => ({ name: w.workName, unitPrice: w.unitPrice, quantity: w.quantity })),
    })
    await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: 'アキクル請求書（Stripe）を発行', req: request })
    return NextResponse.json({ billing }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe請求書の発行に失敗しました'
    console.error('[stripe-invoice] 発行失敗:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
