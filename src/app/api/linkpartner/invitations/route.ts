import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartnerAdmin } from '@/lib/link-partner-auth'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

// 保留中の招待一覧（partner_admin のみ・自組織）
export async function GET() {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invitations = await prisma.linkPartnerInvitation.findMany({
    where: { linkPartnerId: user.linkPartnerId, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, expiresAt: true, createdAt: true },
  })
  return NextResponse.json({ invitations })
}

const createSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z.string().max(100).optional(),
})

// メンバー招待リンクを発行（partner_admin のみ）
export async function POST(req: NextRequest) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { email, name } = parsed.data

  // メールはグローバル一意（v1: 1人1組織）。既に登録済みなら拒否
  const existing = await prisma.linkPartnerMember.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録済みです' }, { status: 409 })
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7日間有効

  await prisma.linkPartnerInvitation.create({
    data: {
      token,
      email,
      name: name || null,
      role: 'member',
      linkPartnerId: user.linkPartnerId,
      expiresAt,
      invitedByMemberId: user.id,
    },
  })

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId,
    memberId: user.id,
    memberName: user.name,
    action: 'invite_member',
    targetType: 'member',
    req,
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  return NextResponse.json({ inviteUrl: `${baseUrl}/linkpartner/invite/${token}`, email, expiresAt })
}

// 招待を取り消す（partner_admin のみ・自組織）
export async function DELETE(req: NextRequest) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
  // 自組織かつ未使用の招待のみ削除
  await prisma.linkPartnerInvitation.deleteMany({
    where: { id, linkPartnerId: user.linkPartnerId, usedAt: null },
  })
  return NextResponse.json({ ok: true })
}
