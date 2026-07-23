import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere } from '@/lib/link-partner-query'
import { setRecordStatus } from '@/lib/link-partner-status'

const schema = z.object({ statusId: z.string().nullable() })

// 顧客の対応ステータスを設定（全メンバー可）。割当フォーム由来の顧客に限定。
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'statusId が不正です' }, { status: 400 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // スコープ検証：割当フォーム由来の顧客のみ
  const customer = await prisma.user.findFirst({
    where: { id, ...linkPartnerCustomerWhere(formIds) },
    select: { id: true, name: true },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await setRecordStatus({
    linkPartnerId: user.linkPartnerId,
    targetType: 'customer',
    targetId: id,
    statusId: parsed.data.statusId,
    member: { id: user.id, name: user.name },
    targetLabel: customer.name,
    req,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, statusId: parsed.data.statusId, label: result.label })
}
