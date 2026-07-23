import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere } from '@/lib/link-partner-query'

// 現在の連携パートナーメンバーのコンテキスト + ダッシュボード用件数
export async function GET() {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await prisma.linkPartner.findUnique({
    where: { id: user.linkPartnerId },
    select: { id: true, name: true },
  })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)

  let customerCount = 0
  let inquiryCount = 0
  if (formIds.length > 0) {
    ;[customerCount, inquiryCount] = await Promise.all([
      prisma.user.count({ where: linkPartnerCustomerWhere(formIds) }),
      prisma.formSubmission.count({ where: { formId: { in: formIds } } }),
    ])
  }

  return NextResponse.json({
    member: { id: user.id, name: user.name, email: user.email, role: user.partnerRole },
    partner,
    stats: { formCount: formIds.length, customerCount, inquiryCount },
  })
}
