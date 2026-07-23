import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere, LINKPARTNER_SAFE_USER_SELECT } from '@/lib/link-partner-query'

// 連携パートナーに割り当てられたフォーム由来の顧客一覧（安全フィールドのみ）
export async function GET(req: NextRequest) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) return NextResponse.json({ customers: [] })

  const q = new URL(req.url).searchParams.get('q')?.trim()
  const base = linkPartnerCustomerWhere(formIds)
  const where = q
    ? {
        ...base,
        OR: [
          { name: { contains: q } },
          { furigana: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ],
      }
    : base

  const customers = await prisma.user.findMany({
    where,
    select: LINKPARTNER_SAFE_USER_SELECT, // include は使わない（案件・機微relationを絶対に返さない）
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json({ customers })
}
