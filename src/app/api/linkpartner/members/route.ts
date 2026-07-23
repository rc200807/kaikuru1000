import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartnerAdmin } from '@/lib/link-partner-auth'

// 自組織のメンバー一覧（partner_admin のみ・パスワードは返さない）
export async function GET() {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await prisma.linkPartnerMember.findMany({
    where: { linkPartnerId: user.linkPartnerId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      acceptedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ members })
}

const patchSchema = z.object({ memberId: z.string(), isActive: z.boolean() })

// メンバーの有効/無効切替（partner_admin のみ・自組織）。自分自身は無効化できない。
export async function PATCH(req: NextRequest) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { memberId, isActive } = parsed.data

  if (memberId === user.id && !isActive) {
    return NextResponse.json({ error: '自分自身を無効化することはできません' }, { status: 400 })
  }

  const member = await prisma.linkPartnerMember.findFirst({
    where: { id: memberId, linkPartnerId: user.linkPartnerId },
    select: { id: true },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.linkPartnerMember.update({
    where: { id: memberId },
    data: { isActive },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })
  return NextResponse.json(updated)
}
