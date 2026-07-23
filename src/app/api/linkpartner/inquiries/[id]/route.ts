import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, LINKPARTNER_SAFE_SUBMISSION_SELECT } from '@/lib/link-partner-query'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

// 問い合わせ（フォーム回答）詳細。割当フォームのものに限定し、他は 404。
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const submission = await prisma.formSubmission.findFirst({
    where: { id, formId: { in: formIds } },
    select: LINKPARTNER_SAFE_SUBMISSION_SELECT,
  })
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId,
    memberId: user.id,
    memberName: user.name,
    action: 'view_inquiry',
    targetType: 'inquiry',
    targetId: id,
    req,
  })

  return NextResponse.json({ submission })
}
