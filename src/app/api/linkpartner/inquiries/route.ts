import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, LINKPARTNER_SAFE_SUBMISSION_SELECT } from '@/lib/link-partner-query'

const PAGE_SIZE = 50

// 割り当てフォームの問い合わせ（フォーム回答）一覧。ページング + フォーム絞り込み。
export async function GET(req: NextRequest) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) {
    return NextResponse.json({ submissions: [], total: 0, page: 1, pageSize: PAGE_SIZE, forms: [] })
  }

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const formFilter = url.searchParams.get('formId')
  // フォーム絞り込みは割当済みフォームに限定（クライアント指定を検証）
  const where =
    formFilter && formIds.includes(formFilter) ? { formId: formFilter } : { formId: { in: formIds } }

  const [submissions, total, assignedForms] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      select: LINKPARTNER_SAFE_SUBMISSION_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.formSubmission.count({ where }),
    prisma.linkPartnerForm.findMany({
      where: { linkPartnerId: user.linkPartnerId },
      select: { form: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    submissions,
    total,
    page,
    pageSize: PAGE_SIZE,
    forms: assignedForms.map((f) => f.form),
  })
}
