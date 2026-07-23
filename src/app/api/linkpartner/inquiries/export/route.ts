import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, LINKPARTNER_SAFE_SUBMISSION_SELECT } from '@/lib/link-partner-query'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'
import { parseSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}
const jst = (d: Date) => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

// 問い合わせCSVエクスポート（割当フォームのみ・BOM付きUTF-8）
// フォームごとに項目が異なるため、回答は「ラベル: 値」を並べた1列にまとめる。
export async function GET(req: Request) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  const url = new URL(req.url)
  const formFilter = url.searchParams.get('formId')
  const where =
    formFilter && formIds.includes(formFilter) ? { formId: formFilter } : { formId: { in: formIds } }

  const submissions = formIds.length
    ? await prisma.formSubmission.findMany({ where, select: LINKPARTNER_SAFE_SUBMISSION_SELECT, orderBy: { createdAt: 'desc' } })
    : []

  const headers = ['受信日時', 'フォーム', '顧客名', '回答内容']
  const rows = submissions.map((s) => {
    let answersStr = ''
    try {
      const schema = parseSchema(s.form.schema)
      const data = JSON.parse(s.data || '{}')
      answersStr = formatAnswersForDisplay(schema, data).map((a) => `${a.label}: ${a.value}`).join(' / ')
    } catch {
      answersStr = ''
    }
    return [jst(s.createdAt), s.form.title, s.user?.name ?? '', answersStr]
  })
  const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(',')).join('\r\n')
  const body = '﻿' + csv

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId, memberId: user.id, memberName: user.name,
    action: 'export_inquiries', targetType: 'inquiry', req,
  })

  const filename = `linkpartner-inquiries-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}
