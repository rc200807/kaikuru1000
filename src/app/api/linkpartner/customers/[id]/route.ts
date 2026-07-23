import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere, LINKPARTNER_SAFE_USER_SELECT } from '@/lib/link-partner-query'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

// 顧客詳細（安全フィールドのみ）。取得と認可を1クエリで行い、他組織の顧客は 404。
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const customer = await prisma.user.findFirst({
    where: { id, ...linkPartnerCustomerWhere(formIds) },
    select: LINKPARTNER_SAFE_USER_SELECT,
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // どの割当フォームから来たか（割当フォームに限定して開示）
  const submissions = await prisma.formSubmission.findMany({
    where: { userId: id, formId: { in: formIds } },
    select: { id: true, createdAt: true, form: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  })

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId,
    memberId: user.id,
    memberName: user.name,
    action: 'view_customer',
    targetType: 'customer',
    targetId: id,
    req,
  })

  return NextResponse.json({ customer, submissions })
}
