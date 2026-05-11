import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { z } from 'zod'

const createSchema = z.object({
  email: z.string().email(),
  name:  z.string().max(100).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

function baseUrl() {
  return process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
}

/** 招待リンク発行（管理者専用） */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { email, name, expiresInDays } = parsed.data

  // 既に有効化済みのパートナーがいたら拒否
  const existing = await prisma.salesPartner.findUnique({ where: { email } })
  if (existing?.password) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録済みです' }, { status: 409 })
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  const invitation = await prisma.salesPartnerInvitation.create({
    data: { token, email, name: name || null, expiresAt, createdById: user.id },
  })

  return NextResponse.json({
    id: invitation.id,
    token: invitation.token,
    email: invitation.email,
    name: invitation.name,
    expiresAt: invitation.expiresAt,
    inviteUrl: `${baseUrl()}/partner/invite/${invitation.token}`,
  }, { status: 201 })
}

/** 招待リンク一覧（管理者専用） */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invitations = await prisma.salesPartnerInvitation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      salesPartner: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(invitations.map(inv => ({
    ...inv,
    inviteUrl: `${baseUrl()}/partner/invite/${inv.token}`,
  })))
}
