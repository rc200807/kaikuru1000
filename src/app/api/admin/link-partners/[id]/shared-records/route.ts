import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere } from '@/lib/link-partner-query'
import { getRecordStatusMap, listLinkPartnerStatuses, isStatusTargetType } from '@/lib/link-partner-status'

const PAGE_SIZE = 30

// パートナーに共有中の問い合わせ / 顧客の一覧（現在の対応ステータス付き・本部の閲覧用）
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  if (!isStatusTargetType(type)) {
    return NextResponse.json({ error: 'type は inquiry か customer を指定してください' }, { status: 400 })
  }
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)

  const formIds = await resolveAssignedFormIds(id)
  const statuses = await listLinkPartnerStatuses(id, type)
  if (formIds.length === 0) {
    return NextResponse.json({ records: [], total: 0, page: 1, pageSize: PAGE_SIZE, statuses })
  }

  if (type === 'inquiry') {
    const where = { formId: { in: formIds } }
    const [subs, total] = await Promise.all([
      prisma.formSubmission.findMany({
        where,
        select: { id: true, createdAt: true, form: { select: { title: true } }, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.formSubmission.count({ where }),
    ])
    const statusMap = await getRecordStatusMap(id, 'inquiry', subs.map((s) => s.id))
    return NextResponse.json({
      records: subs.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        title: s.form.title,
        subtitle: s.user?.name ?? null,
        status: statusMap[s.id] ?? null,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      statuses,
    })
  }

  // customer
  const where = linkPartnerCustomerWhere(formIds)
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, furigana: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ])
  const statusMap = await getRecordStatusMap(id, 'customer', users.map((u) => u.id))
  return NextResponse.json({
    records: users.map((u) => ({
      id: u.id,
      createdAt: u.createdAt,
      title: u.name,
      subtitle: u.phone,
      status: statusMap[u.id] ?? null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    statuses,
  })
}
