import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { findLinkedLineUser, sendDocumentViaLine, LINE_DOC_LABELS } from '@/lib/line-document'
import { recordAccessLog } from '@/lib/access-log'

async function loadScheduleWithAuth(id: string) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const schedule = await prisma.visitSchedule.findUnique({
    where: { id },
    select: {
      id: true, userId: true, storeId: true, dealId: true,
      user: { select: { name: true } },
    },
  })
  if (!schedule) {
    return { error: NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 }) }
  }
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { schedule, sessionUser }
}

// GET /api/visit-schedules/[id]/send-line?docType=contract|estimate — LINE連携・送付状態（QR表示中のポーリング用）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { schedule, error } = await loadScheduleWithAuth(id)
  if (error) return error

  const docType = request.nextUrl.searchParams.get('docType') === 'estimate' ? 'estimate' : 'contract'

  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
    select: { loginChannelId: true, loginChannelSecret: true },
  })
  const enabled = !!(channel?.loginChannelId && channel?.loginChannelSecret)

  const linked = enabled ? await findLinkedLineUser(schedule!.userId) : null

  const docWhere = schedule!.dealId ? { dealId: schedule!.dealId } : { visitScheduleId: schedule!.id }
  const doc = docType === 'contract'
    ? await prisma.salesContract.findFirst({ where: docWhere, select: { lineSentAt: true } })
    : await prisma.estimate.findFirst({ where: docWhere, select: { lineSentAt: true } })

  return NextResponse.json({
    enabled,
    linked: !!linked,
    isFollowing: linked?.isFollowing ?? false,
    lineSentAt: doc?.lineSentAt ?? null,
  })
}

const postSchema = z.object({
  docType: z.enum(['contract', 'estimate']),
})

// POST /api/visit-schedules/[id]/send-line — 連携済み顧客のLINEへ書類の閲覧リンクを送付
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { schedule, sessionUser, error } = await loadScheduleWithAuth(id)
  if (error) return error

  const parsed = postSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }
  const { docType } = parsed.data

  const linked = await findLinkedLineUser(schedule!.userId)
  if (!linked) {
    return NextResponse.json(
      { error: 'この顧客はLINE連携されていません。QRコードから連携してください。' },
      { status: 400 }
    )
  }

  const result = await sendDocumentViaLine(schedule!.id, docType, linked.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await recordAccessLog({
    userType: sessionUser.role,
    userId: sessionUser.id,
    userName: sessionUser.name ?? '',
    action: `${LINE_DOC_LABELS[docType]}をLINE送付「${schedule!.user.name}」`,
    req: request,
  })

  return NextResponse.json({ success: true })
}
