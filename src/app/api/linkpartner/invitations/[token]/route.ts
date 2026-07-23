import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

// 招待トークン検証（パブリック）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const inv = await prisma.linkPartnerInvitation.findUnique({
    where: { token },
    include: { linkPartner: { select: { name: true, isActive: true } } },
  })
  if (!inv) return NextResponse.json({ error: '無効な招待リンクです' }, { status: 404 })
  if (inv.usedAt) return NextResponse.json({ error: 'この招待リンクは使用済みです' }, { status: 410 })
  if (inv.expiresAt < new Date()) return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })
  if (!inv.linkPartner || !inv.linkPartner.isActive) {
    return NextResponse.json({ error: 'この連携パートナーは現在利用できません' }, { status: 410 })
  }
  return NextResponse.json({ email: inv.email, name: inv.name, partnerName: inv.linkPartner.name, expiresAt: inv.expiresAt })
}

const acceptSchema = z.object({
  name: z.string().min(1, '氏名は必須です').max(100),
  password: z.string().min(8, 'パスワードは8文字以上で設定してください').max(128),
})

// 招待を受諾してメンバー登録（パブリック）
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const parsed = acceptSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const inv = await prisma.linkPartnerInvitation.findUnique({
    where: { token },
    include: { linkPartner: { select: { isActive: true } } },
  })
  if (!inv) return NextResponse.json({ error: '無効な招待リンクです' }, { status: 404 })
  if (inv.usedAt) return NextResponse.json({ error: 'この招待リンクは使用済みです' }, { status: 410 })
  if (inv.expiresAt < new Date()) return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })
  if (!inv.linkPartner || !inv.linkPartner.isActive) {
    return NextResponse.json({ error: 'この連携パートナーは現在利用できません' }, { status: 410 })
  }

  // メールはグローバル一意
  const existing = await prisma.linkPartnerMember.findUnique({ where: { email: inv.email }, select: { id: true } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録済みです' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10)
  const now = new Date()

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.linkPartnerMember.create({
      data: {
        linkPartnerId: inv.linkPartnerId,
        name: parsed.data.name,
        email: inv.email,
        password: hashed,
        role: inv.role,
        isActive: true,
        mustChangePassword: false, // 自分でパスワードを設定するため変更強制なし
        invitedByMemberId: inv.invitedByMemberId,
        acceptedAt: now,
      },
      select: { id: true, name: true, email: true },
    })
    await tx.linkPartnerInvitation.update({ where: { id: inv.id }, data: { usedAt: now, memberId: m.id } })
    return m
  })

  await recordLinkPartnerActivity({
    linkPartnerId: inv.linkPartnerId,
    memberId: member.id,
    memberName: member.name,
    action: 'accept_invite',
    targetType: 'member',
    targetId: member.id,
    req,
  })

  return NextResponse.json({ ok: true, email: member.email })
}
