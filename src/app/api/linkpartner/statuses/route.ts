import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner, requireLinkPartnerAdmin } from '@/lib/link-partner-auth'
import { isStatusTargetType, listLinkPartnerStatuses } from '@/lib/link-partner-status'

// 対応ステータス定義の一覧（全メンバー・インライン選択に必要）。?targetType=inquiry|customer
export async function GET(req: NextRequest) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const targetType = new URL(req.url).searchParams.get('targetType')
  if (!isStatusTargetType(targetType)) {
    return NextResponse.json({ error: 'targetType は inquiry か customer を指定してください' }, { status: 400 })
  }
  const statuses = await listLinkPartnerStatuses(user.linkPartnerId, targetType)
  return NextResponse.json({ statuses })
}

const createSchema = z.object({
  targetType: z.enum(['inquiry', 'customer']),
  label: z.string().min(1, 'ステータス名は必須です').max(40),
  color: z.string().max(20).optional(),
})

// 対応ステータス定義を追加（partner_admin のみ）
export async function POST(req: NextRequest) {
  const user = await requireLinkPartnerAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { targetType, label, color } = parsed.data
  const last = await prisma.linkPartnerStatus.findFirst({
    where: { linkPartnerId: user.linkPartnerId, targetType },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const created = await prisma.linkPartnerStatus.create({
    data: {
      linkPartnerId: user.linkPartnerId,
      targetType,
      label,
      color: color || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, targetType: true, label: true, color: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json(created, { status: 201 })
}
