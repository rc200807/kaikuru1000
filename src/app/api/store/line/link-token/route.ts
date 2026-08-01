import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { z } from 'zod'
import { buildAuthorizeUrl } from '@/lib/line-login'
import { findLinkedLineUser } from '@/lib/line-document'

const bodySchema = z.object({
  visitScheduleId: z.string().min(1),
  docType: z.enum(['contract', 'estimate']),
})

// POST /api/store/line/link-token — 契約書・見積書のLINE送付用の連携QRを発行
// 顧客が既に既定チャネルへ連携済みならトークンを発行せず alreadyLinked を返す。
// 未連携なら「連携完了後にその書類を自動送付する」LineLinkToken（purpose=docType）を発行し、
// LINE Login 認可URL（QRコード化してお客様に読み取ってもらう）を返す。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }
  const { visitScheduleId, docType } = parsed.data

  const schedule = await prisma.visitSchedule.findUnique({
    where: { id: visitScheduleId },
    select: { id: true, userId: true, storeId: true },
  })
  if (!schedule) {
    return NextResponse.json({ error: 'スケジュールが見つかりません' }, { status: 404 })
  }
  // 店舗は自店舗のスケジュールのみ（契約提出APIと同じ認可）
  if (sessionUser.role === 'store' && schedule.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 既定チャネル（LINE Login 設定済み）
  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
  })
  if (!channel || !channel.loginChannelId || !channel.loginChannelSecret) {
    return NextResponse.json({ enabled: false, alreadyLinked: false })
  }

  // 既に連携済みならQRは不要（そのまま送付できる）
  const linked = await findLinkedLineUser(schedule.userId)
  if (linked) {
    return NextResponse.json({
      enabled: true,
      alreadyLinked: true,
      isFollowing: linked.isFollowing,
    })
  }

  // 連携完了後に書類を自動送付するトークンを発行（15分有効・1回限り）
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.lineLinkToken.create({
    data: {
      token,
      userId: schedule.userId,
      storeId: schedule.storeId,
      lineChannelId: channel.id,
      purpose: docType,
      visitScheduleId: schedule.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  })

  return NextResponse.json({
    enabled: true,
    alreadyLinked: false,
    authUrl: buildAuthorizeUrl(channel.loginChannelId, token),
  })
}
