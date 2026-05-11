import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

/** 招待トークン検証（パブリック） */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const inv = await prisma.salesPartnerInvitation.findUnique({ where: { token } })
  if (!inv) return NextResponse.json({ error: '無効な招待リンクです' }, { status: 404 })
  if (inv.usedAt) return NextResponse.json({ error: 'この招待リンクは使用済みです' }, { status: 410 })
  if (inv.expiresAt < new Date()) {
    return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })
  }
  return NextResponse.json({
    email: inv.email,
    name: inv.name,
    expiresAt: inv.expiresAt,
  })
}

const acceptSchema = z.object({
  name:     z.string().min(1).max(100),
  password: z.string().min(8).max(128),
})

/** 招待を受諾してパートナー登録（パブリック） */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = await req.json()
  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const inv = await prisma.salesPartnerInvitation.findUnique({ where: { token } })
  if (!inv) return NextResponse.json({ error: '無効な招待リンクです' }, { status: 404 })
  if (inv.usedAt) return NextResponse.json({ error: 'この招待リンクは使用済みです' }, { status: 410 })
  if (inv.expiresAt < new Date()) {
    return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 410 })
  }

  // 既に同メールのパートナーが居て、password が未設定なら再利用、設定済みなら拒否
  const existing = await prisma.salesPartner.findUnique({ where: { email: inv.email } })
  if (existing?.password) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録済みです' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10)
  const now = new Date()

  const partner = existing
    ? await prisma.salesPartner.update({
        where: { id: existing.id },
        data: { name: parsed.data.name, password: hashed, isActive: true, acceptedAt: now },
      })
    : await prisma.salesPartner.create({
        data: {
          name: parsed.data.name,
          email: inv.email,
          password: hashed,
          isActive: true,
          invitedById: inv.createdById,
          acceptedAt: now,
        },
      })

  await prisma.salesPartnerInvitation.update({
    where: { id: inv.id },
    data: { usedAt: now, salesPartnerId: partner.id },
  })

  return NextResponse.json({ ok: true, email: partner.email })
}
